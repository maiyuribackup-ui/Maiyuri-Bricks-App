/**
 * Gemini Audio Transcription Service
 *
 * Transcribes audio files using Google's Gemini API.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { log, logError } from "./logger.js";
import { generateValidatedTranscription } from "./transcription-quality.js";

interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
}

const MAX_TRANSCRIPTION_OUTPUT_TOKENS = 4_096;
export const TRANSCRIPTION_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }

  return new GoogleGenerativeAI(apiKey);
}

export function toSafeProviderError(error: unknown): Error {
  const candidate = error as { status?: unknown; message?: unknown };
  const message =
    typeof candidate?.message === "string" ? candidate.message : "";
  const status =
    typeof candidate?.status === "number"
      ? candidate.status
      : Number(message.match(/\b(?:4\d\d|5\d\d)\b/)?.[0] ?? 0);
  const normalized = message.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    /api[_ ]?key.{0,24}(?:expired|invalid|not valid)|(?:expired|invalid).{0,24}api[_ ]?key/.test(
      normalized,
    )
  ) {
    return new Error(
      `Gemini transcription provider API key invalid${status ? ` (${status})` : ""}`,
    );
  }
  if (
    /resource_exhausted|prepayment credits|depleted|quota|rate.?limit/.test(
      normalized,
    )
  ) {
    return new Error(
      `Gemini transcription provider rate limit${status ? ` (${status})` : ""}`,
    );
  }
  if (status === 404) {
    return new Error("Gemini transcription provider model unavailable (404)");
  }
  if (status === 429) {
    return new Error("Gemini transcription provider rate limit (429)");
  }
  if (status >= 500) {
    return new Error(`Gemini transcription provider unavailable (${status})`);
  }
  if (/timeout|timed out|etimedout/.test(normalized)) {
    return new Error("Gemini transcription provider timeout");
  }
  if (/fetch failed|econnreset|enotfound|network/.test(normalized)) {
    return new Error("Gemini transcription provider network failure");
  }
  return new Error(
    status
      ? `Gemini transcription provider request failed (${status})`
      : "Gemini transcription provider request failed",
  );
}

export function isTranscriptionInfrastructureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /missing google_ai_api_key|provider (?:api key invalid|model unavailable|rate limit|unavailable|timeout|network failure)|gemini transcription timed out/i.test(
    message,
  );
}

/** Transcribe audio using bounded, quality-validated Gemini attempts. */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<TranscriptionResult> {
  return transcribeAudioWithClient(audioBuffer, filename, getGeminiClient());
}

export async function transcribeAudioWithClient(
  audioBuffer: Buffer,
  filename: string,
  genAI: GoogleGenerativeAI,
): Promise<TranscriptionResult> {
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

End with exactly one metadata line using this format:
Primary language: Tamil, English, or Tamil-English mixed`;

  try {
    const { transcript, language } = await generateValidatedTranscription(
      async (attempt, timeoutMs) => {
        const modelSlug = TRANSCRIPTION_MODELS[attempt] ?? "gemini-2.5-flash";
        const model = genAI.getGenerativeModel({
          model: modelSlug,
          generationConfig: {
            maxOutputTokens: MAX_TRANSCRIPTION_OUTPUT_TOKENS,
            temperature: 0.1,
          },
        });

        try {
          const result = await model.generateContent(
            [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              { text: prompt },
            ],
            { timeout: timeoutMs },
          );
          const text = result.response.text();
          const finishReason = result.response.candidates?.[0]?.finishReason;
          log("Gemini transcription attempt complete", {
            model: modelSlug,
            attempt: attempt + 1,
            chars: text.length,
            finishReason: finishReason ?? "unknown",
          });
          return { text, finishReason };
        } catch (error) {
          throw toSafeProviderError(error);
        }
      },
      { maxAttempts: TRANSCRIPTION_MODELS.length },
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

/** Summarize a transcript (useful for long calls). */
export async function summarizeTranscript(transcript: string): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: TRANSCRIPTION_MODELS[1] });

  const prompt = `Summarize this sales call transcript in 3-5 bullet points. Focus on:
- Key topics discussed
- Customer requirements or concerns
- Any commitments made
- Next steps mentioned

If the transcript is in Tamil, provide the summary in Tamil.

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    logError("Summarization failed", error);
    return "Summary unavailable";
  }
}
