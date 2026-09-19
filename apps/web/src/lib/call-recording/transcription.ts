/**
 * Gemini Audio Transcription Service
 *
 * Transcribes audio files using Google's Gemini 2.0 Flash API.
 * Accepts raw audio (WAV, OGG, M4A) natively - no ffmpeg conversion needed.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODEL } from "@/lib/ai/models";
import { traceAiGeneration } from "@/lib/observability/langfuse";
import { log, logError } from "./logger";
import type { TranscriptionResult } from "./types";

const MAX_TRANSCRIPT_CHARS = 7_500;
const MAX_REPEATED_LONG_LINE = 3;
const MAX_TRANSCRIPTION_OUTPUT_TOKENS = 2_000;

export function transcriptPassesQuality(transcript: string): boolean {
  const text = transcript.trim();
  if (!text || text.length > MAX_TRANSCRIPT_CHARS) return false;

  const longLineCounts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const normalized = line.trim();
    if (normalized.length < 40) continue;
    const count = (longLineCounts.get(normalized) ?? 0) + 1;
    if (count > MAX_REPEATED_LONG_LINE) return false;
    longLineCounts.set(normalized, count);
  }

  return true;
}

export async function generateValidatedTranscription(
  generate: (attempt: number) => Promise<string>,
  maxAttempts = 3,
): Promise<{ transcript: string; language: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const parsed = parseTranscriptionResponse(await generate(attempt));
    if (transcriptPassesQuality(parsed.transcript)) return parsed;
  }

  throw new Error(
    `Gemini transcription failed quality validation after ${maxAttempts} attempts: response was empty, oversized, or repetitive`,
  );
}

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Transcribe audio using Gemini 2.0 Flash
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<TranscriptionResult> {
  const genAI = getGeminiClient();
  const base64Audio = audioBuffer.toString("base64");
  const mimeType = getMimeType(filename);

  const prompt = `Transcribe this audio recording of a sales call. The call may be in Tamil, English, or a mix of both languages (Tamil-English code-switching is common).

Instructions:
1. Transcribe the entire audio accurately
2. If the audio is in Tamil, provide the transcription in Tamil script
3. If English words are used within Tamil conversation, keep them in English
4. Include speaker labels if you can distinguish different speakers (e.g., "Sales Staff:", "Customer:")
5. Note any unclear or inaudible portions as [inaudible]
6. Do not translate - transcribe in the original language spoken
7. Do not repeat lines or invent speech that is not audible

At the end, on a new line, state the primary language detected (Tamil, English, or Tamil-English mixed).`;

  try {
    const modelSlugs = [
      GEMINI_DEFAULT_MODEL,
      GEMINI_DEFAULT_MODEL,
      GEMINI_MODEL.FLASH,
    ];
    const { transcript, language } = await generateValidatedTranscription(
      async (attempt) => {
        const modelSlug = modelSlugs[attempt] ?? GEMINI_MODEL.FLASH;
        const model = genAI.getGenerativeModel({
          model: modelSlug,
          generationConfig: {
            maxOutputTokens: MAX_TRANSCRIPTION_OUTPUT_TOKENS,
            temperature: 0.1,
          },
        });
        return traceAiGeneration({
          name: "app.call_recording.transcribe_audio",
          model: modelSlug,
          input: {
            filename,
            mimeType,
            audioBytes: audioBuffer.length,
            attempt,
          },
          metadata: { module: "call_recording", step: "transcribe_audio" },
          run: async () => {
            const result = await model.generateContent([
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              { text: prompt },
            ]);
            const output = result.response.text();
            return { output, value: output };
          },
        });
      },
      modelSlugs.length,
    );

    log("Transcription complete", {
      length: transcript.length,
      language,
      filename,
    });

    return {
      text: transcript,
      language,
      confidence: 0.9,
    };
  } catch (error) {
    logError("Gemini transcription failed", error);
    throw error;
  }
}

function parseTranscriptionResponse(response: string): {
  transcript: string;
  language: string;
} {
  const lines = response.trim().split("\n");
  const lastLine = lines[lines.length - 1] ?? "";
  const normalizedLastLine = lastLine.trim().toLowerCase();
  const isLanguageFooter =
    normalizedLastLine.length <= 120 &&
    (normalizedLastLine.includes("tamil") ||
      normalizedLastLine.includes("english") ||
      normalizedLastLine.includes("language") ||
      normalizedLastLine.includes("mixed"));

  let language = "unknown";

  // Only a concise language footer is metadata. Long content that happens to
  // mention a language must remain in the transcript and pass quality checks.
  if (
    isLanguageFooter &&
    (normalizedLastLine.includes("tamil-english") ||
      normalizedLastLine.includes("mixed"))
  ) {
    language = "ta-en";
  } else if (isLanguageFooter && normalizedLastLine.includes("tamil")) {
    language = "ta";
  } else if (isLanguageFooter && normalizedLastLine.includes("english")) {
    language = "en";
  }

  const transcript =
    language !== "unknown"
      ? lines.slice(0, -1).join("\n").trim()
      : response.trim();

  return { transcript, language };
}

function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();

  const mimeTypes: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
  };

  return mimeTypes[ext ?? ""] ?? "audio/mpeg";
}
