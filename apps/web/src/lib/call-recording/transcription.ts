/**
 * Gemini Audio Transcription Service
 *
 * Transcribes audio files using Google's Gemini API.
 * Accepts raw audio (WAV, OGG, M4A) natively - no ffmpeg conversion needed.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODEL } from "@/lib/ai/models";
import { traceAiGeneration } from "@/lib/observability/langfuse";
import { log, logError } from "./logger";
import { isInfraError } from "./notifications";
import type { TranscriptionResult } from "./types";

const MAX_TRANSCRIPT_CHARS = 50_000;
const MIN_REPEATED_LINE_CHARS = 16;
const MAX_NORMALIZED_LINE_REPEATS = 5;
const MAX_TRANSCRIPTION_OUTPUT_TOKENS = 4_096;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 25_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 55_000;

export interface GeneratedTranscription {
  text: string;
  finishReason?: string;
}

export function transcriptionTraceOutput(candidate: GeneratedTranscription): {
  chars: number;
  finishReason: string;
} {
  return {
    chars: candidate.text.length,
    finishReason: candidate.finishReason ?? "unknown",
  };
}

interface ValidationOptions {
  maxAttempts?: number;
  attemptTimeoutMs?: number;
  totalTimeoutMs?: number;
}

function normalizeSpeech(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/^[\p{L}\p{N} ._-]{1,30}:\s*/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRepeatedLines(text: string): boolean {
  const counts = new Map<string, number>();
  let normalizedChars = 0;

  for (const line of text.split("\n")) {
    const normalized = normalizeSpeech(line);
    if (normalized.length < MIN_REPEATED_LINE_CHARS) continue;
    normalizedChars += normalized.length;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  for (const [line, count] of counts) {
    if (
      count >= MAX_NORMALIZED_LINE_REPEATS &&
      (line.length * count) / Math.max(normalizedChars, 1) >= 0.35
    ) {
      return true;
    }
  }

  return false;
}

function hasRepeatedWordBlocks(text: string): boolean {
  const words = normalizeSpeech(text).split(" ").filter(Boolean);
  if (words.length < 30) return false;

  const trigrams = new Map<string, number>();
  for (let index = 0; index <= words.length - 3; index += 1) {
    const trigram = words.slice(index, index + 3).join(" ");
    trigrams.set(trigram, (trigrams.get(trigram) ?? 0) + 1);
  }

  const total = words.length - 2;
  const mostRepeated = Math.max(...trigrams.values());
  return mostRepeated >= 6 && trigrams.size / total < 0.45;
}

export function transcriptPassesQuality(transcript: string): boolean {
  const text = transcript.trim();
  if (!text || text.length > MAX_TRANSCRIPT_CHARS) return false;
  return !hasRepeatedLines(text) && !hasRepeatedWordBlocks(text);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Gemini transcription timed out after ${timeoutMs}ms`),
        ),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function generateValidatedTranscription(
  generate: (
    attempt: number,
    timeoutMs: number,
  ) => Promise<GeneratedTranscription>,
  options: ValidationOptions = {},
): Promise<{ transcript: string; language: string }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attemptTimeoutMs =
    options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error("maxAttempts must be a positive integer");
  }
  if (attemptTimeoutMs <= 0 || totalTimeoutMs <= 0) {
    throw new Error("transcription timeouts must be positive");
  }

  const startedAt = Date.now();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw new Error("Gemini transcription timed out before the next attempt");
    }

    const timeoutMs = Math.min(attemptTimeoutMs, remainingMs);
    const candidate = await withTimeout(
      generate(attempt, timeoutMs),
      timeoutMs,
    );
    if (candidate.finishReason !== "STOP") continue;

    const parsed = parseTranscriptionResponse(candidate.text);
    if (transcriptPassesQuality(parsed.transcript)) return parsed;
  }

  throw new Error(
    `Gemini transcription failed quality validation after ${maxAttempts} attempts: response was empty, incomplete, oversized, or repetitive`,
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
  requestOptions?: Parameters<GenerativeModel["generateContent"]>[1],
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await model.generateContent(parts, requestOptions);
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

/** Transcribe audio using bounded, quality-validated Gemini attempts. */
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

End with exactly one metadata line using this format:
Primary language: Tamil, English, or Tamil-English mixed`;

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
    const modelSlugs = [GEMINI_DEFAULT_MODEL, GEMINI_MODEL.FLASH];
    const { transcript, language } = await generateValidatedTranscription(
      async (attempt, timeoutMs) => {
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
            mimeType,
            audioBytes: audioBuffer.length,
            attempt,
          },
          metadata: { module: "call_recording", step: "transcribe_audio" },
          run: async () => {
            try {
              // #51: ride out transient Gemini 503 spikes in-process with
              // exponential backoff, bounded by main's per-attempt timeout.
              const result = await generateContentWithRetry(model, parts, {
                timeout: timeoutMs,
              });
              const text = result.response.text();
              const finishReason =
                result.response.candidates?.[0]?.finishReason;
              const value = { text, finishReason };
              return {
                output: transcriptionTraceOutput(value),
                value,
              };
            } catch (error) {
              throw toSafeProviderError(error);
            }
          },
        });
      },
      { maxAttempts: modelSlugs.length },
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
  const lastLine = lines[lines.length - 1]?.trim() ?? "";
  const footer = lastLine.match(
    /^primary language(?: detected)?:\s*(tamil|english|tamil[-\s]english(?: mixed)?|mixed)$/i,
  );

  if (!footer) return { transcript: response.trim(), language: "unknown" };

  const detected = footer[1].toLocaleLowerCase();
  const language =
    detected === "tamil" ? "ta" : detected === "english" ? "en" : "ta-en";
  return {
    transcript: lines.slice(0, -1).join("\n").trim(),
    language,
  };
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
