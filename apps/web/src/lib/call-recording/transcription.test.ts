import { describe, expect, it } from "vitest";
import {
  generateValidatedTranscription,
  toSafeProviderError,
  transcriptPassesQuality,
  transcriptionTraceOutput,
  type GeneratedTranscription,
} from "./transcription";

const plausibleTranscript = [
  "Sales Staff: வணக்கம் சார், Maiyuri Bricks-லிருந்து பேசுறேன்.",
  "Customer: வணக்கம். 6 inch brick rate சொல்லுங்க.",
  "Sales Staff: Quantity மற்றும் delivery location சொல்ல முடியுமா?",
  "Customer: சுமார் 5000 bricks, Coimbatore site.",
].join("\n");

const repeatedHallucination = Array.from(
  { length: 8 },
  () =>
    "Customer: இந்த வரி ஆடியோவில் இல்லாமல் மீண்டும் மீண்டும் உருவாக்கப்பட்ட தவறான உரையாகும்.",
).join("\n");

const complete = (text: string): GeneratedTranscription => ({
  text,
  finishReason: "STOP",
});

describe("transcriptPassesQuality", () => {
  it("emits only privacy-safe transcription trace metadata", () => {
    const privateTranscript = "Customer Ram lives at a private address";
    const traceOutput = transcriptionTraceOutput({
      text: privateTranscript,
      finishReason: "STOP",
    });

    expect(traceOutput).toEqual({
      chars: privateTranscript.length,
      finishReason: "STOP",
    });
    expect(JSON.stringify(traceOutput)).not.toContain("Customer Ram");
  });

  it("accepts a plausible Tamil-English sales-call transcript", () => {
    expect(transcriptPassesQuality(plausibleTranscript)).toBe(true);
  });

  it("rejects repeated-line hallucination loops", () => {
    expect(transcriptPassesQuality(repeatedHallucination)).toBe(false);
  });

  it("rejects repeated short lines", () => {
    const repeatedShortLine = Array.from(
      { length: 150 },
      () => "Customer: Please send the quotation",
    ).join("\n");

    expect(transcriptPassesQuality(repeatedShortLine)).toBe(false);
  });

  it("rejects repetition hidden inside one line", () => {
    expect(
      transcriptPassesQuality("Please send the quotation. ".repeat(150)),
    ).toBe(false);
  });

  it("normalizes speaker labels, case, whitespace, and punctuation", () => {
    const variants = Array.from({ length: 30 }, (_, index) =>
      index % 2 === 0
        ? "Customer: SEND the quotation, please!"
        : "Sales Staff:  send the quotation please ",
    ).join("\n");

    expect(transcriptPassesQuality(variants)).toBe(false);
  });

  it("rejects only an extreme absolute transcript size", () => {
    expect(transcriptPassesQuality("word ".repeat(12_000))).toBe(false);
  });
});

describe("toSafeProviderError", () => {
  it("preserves safe infrastructure classification without leaking provider text", () => {
    const secret = "customer-audio-secret";
    const network = toSafeProviderError(
      new Error(`fetch failed while sending ${secret}`),
    );
    const credentials = toSafeProviderError({
      status: 401,
      message: `API key ${secret} is invalid`,
    });

    expect(network.message).toBe(
      "Gemini transcription provider network failure",
    );
    expect(credentials.message).toBe(
      "Gemini transcription provider API key invalid (401)",
    );
    expect(`${network.message} ${credentials.message}`).not.toContain(secret);
  });

  it("preserves API-key classification when Google reports it as HTTP 400", () => {
    const safe = toSafeProviderError({
      status: 400,
      message: "API key expired for customer@example.com",
    });

    expect(safe.message).toBe(
      "Gemini transcription provider API key invalid (400)",
    );
    expect(safe.message).not.toContain("customer@example.com");
  });
});

describe("generateValidatedTranscription", () => {
  it("retries a corrupt response and returns the first valid transcript", async () => {
    const responses = [
      complete(
        `${repeatedHallucination}\nPrimary language: Tamil-English mixed`,
      ),
      complete(`${plausibleTranscript}\nPrimary language: Tamil-English mixed`),
    ];
    const attempts: number[] = [];

    const result = await generateValidatedTranscription(async (attempt) => {
      attempts.push(attempt);
      return responses[attempt];
    });

    expect(attempts).toEqual([0, 1]);
    expect(result).toEqual({
      transcript: plausibleTranscript,
      language: "ta-en",
    });
  });

  it("rejects MAX_TOKENS output and retries with a complete candidate", async () => {
    const attempts: number[] = [];

    const result = await generateValidatedTranscription(async (attempt) => {
      attempts.push(attempt);
      return attempt === 0
        ? { text: plausibleTranscript, finishReason: "MAX_TOKENS" }
        : complete(`${plausibleTranscript}\nPrimary language: English`);
    });

    expect(attempts).toEqual([0, 1]);
    expect(result.language).toBe("en");
  });

  it("rejects a candidate with missing completion metadata", async () => {
    await expect(
      generateValidatedTranscription(
        async () => ({ text: plausibleTranscript }),
        { maxAttempts: 1 },
      ),
    ).rejects.toThrow("failed quality validation after 1 attempts");
  });

  it("fails closed when every response is corrupt", async () => {
    await expect(
      generateValidatedTranscription(
        async () =>
          complete(
            `${repeatedHallucination}\nPrimary language: Tamil-English mixed`,
          ),
        { maxAttempts: 2 },
      ),
    ).rejects.toThrow("failed quality validation after 2 attempts");
  });

  it("does not hide or multiply provider failures", async () => {
    const attempts: number[] = [];

    await expect(
      generateValidatedTranscription(async (attempt) => {
        attempts.push(attempt);
        throw new Error("429 prepaid credits depleted");
      }),
    ).rejects.toThrow("429 prepaid credits depleted");

    expect(attempts).toEqual([0]);
  });

  it("does not let an oversized language-tagged tail bypass validation", async () => {
    const oversizedTail = "Tamil-English mixed ".repeat(3_000);

    await expect(
      generateValidatedTranscription(
        async () => complete(`${plausibleTranscript}\n${oversizedTail}`),
        { maxAttempts: 1 },
      ),
    ).rejects.toThrow("failed quality validation after 1 attempts");
  });

  it("preserves genuine final speech that mentions English", async () => {
    const finalSpeech =
      "Customer: Please send the details in English on WhatsApp.";

    const result = await generateValidatedTranscription(
      async () => complete(`${plausibleTranscript}\n${finalSpeech}`),
      { maxAttempts: 1 },
    );

    expect(result.transcript).toContain(finalSpeech);
    expect(result.language).toBe("unknown");
  });

  it("accepts only the strict primary-language footer", async () => {
    const result = await generateValidatedTranscription(
      async () =>
        complete(
          `${plausibleTranscript}\nPrimary language: Tamil-English mixed`,
        ),
      { maxAttempts: 1 },
    );

    expect(result).toEqual({
      transcript: plausibleTranscript,
      language: "ta-en",
    });
  });

  it("enforces the per-attempt timeout", async () => {
    await expect(
      generateValidatedTranscription(
        async () => new Promise<GeneratedTranscription>(() => undefined),
        { maxAttempts: 1, attemptTimeoutMs: 5, totalTimeoutMs: 10 },
      ),
    ).rejects.toThrow("timed out");
  });

  it("rejects invalid maxAttempts before invoking the provider", async () => {
    const generate = async () => complete(plausibleTranscript);

    await expect(
      generateValidatedTranscription(generate, { maxAttempts: 0 }),
    ).rejects.toThrow("maxAttempts must be a positive integer");
  });
});
