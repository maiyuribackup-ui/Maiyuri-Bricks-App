const MAX_TRANSCRIPT_CHARS = 50_000;
const MIN_REPEATED_LINE_CHARS = 16;
const MAX_NORMALIZED_LINE_REPEATS = 5;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 30_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 65_000;

export interface GeneratedTranscription {
  text: string;
  finishReason?: string;
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
