/**
 * Gemini Audio Transcription Service
 *
 * Transcribes audio files using Google's Gemini 2.0 Flash API.
 * Accepts raw audio (WAV, OGG, M4A) natively - no ffmpeg conversion needed.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";
import { log, logError } from "./logger";
import { isInfraError } from "./notifications";
import type { TranscriptionResult } from "./types";

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Transcription attempts: 1 initial + 3 retries. Gemini "503 high demand"
 * spikes are usually transient (seconds), so we ride them out in-process
 * rather than failing a real recording and waiting on the 4-hour cron.
 */
const MAX_TRANSCRIPTION_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;

/** Exponential backoff with jitter: ~1s, ~2s, ~4s before retries 1..3. */
export function transcriptionBackoffMs(retry: number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** (retry - 1);
  const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS);
  return exponential + jitter;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Call Gemini, retrying ONLY transient infra errors (503/5xx, overload, quota,
 * network) — classified by the SAME `isInfraError` that protects the retry
 * budget, so "transient" means one thing across the whole pipeline. Permanent
 * errors (bad audio, unsupported format) fail fast with no wasted retries.
 * On exhaustion the original error is rethrown, so the processor's catch still
 * classifies it as infra and the cron resumes it later — backoff and the
 * retry-budget guard are complementary, not redundant.
 */
async function generateContentWithRetry(
  model: GenerativeModel,
  parts: Parameters<GenerativeModel["generateContent"]>[0],
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await model.generateContent(parts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= MAX_TRANSCRIPTION_ATTEMPTS || !isInfraError(message)) {
        throw error;
      }
      const nextDelayMs = transcriptionBackoffMs(attempt);
      log("Gemini transient error — retrying transcription", {
        attempt,
        nextDelayMs,
        error: message.slice(0, 120),
      });
      await sleep(nextDelayMs);
    }
  }
}

/**
 * Transcribe audio using Gemini 2.0 Flash
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<TranscriptionResult> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });

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

At the end, on a new line, state the primary language detected (Tamil, English, or Tamil-English mixed).`;

  const parts = [
    {
      inlineData: {
        mimeType,
        data: base64Audio,
      },
    },
    { text: prompt },
  ];

  try {
    const result = await generateContentWithRetry(model, parts);

    const response = result.response;
    const fullText = response.text();

    const { transcript, language } = parseTranscriptionResponse(fullText);

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
  const lastLine = lines[lines.length - 1].toLowerCase();

  let language = "unknown";

  if (lastLine.includes("tamil-english") || lastLine.includes("mixed")) {
    language = "ta-en";
  } else if (lastLine.includes("tamil")) {
    language = "ta";
  } else if (lastLine.includes("english")) {
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
