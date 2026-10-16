import assert from "node:assert/strict";
import test from "node:test";

import {
  generateValidatedTranscription,
  transcriptPassesQuality,
  type GeneratedTranscription,
} from "./transcription-quality.js";

const plausibleTranscript = [
  "Sales Staff: வணக்கம் சார், Maiyuri Bricks-லிருந்து பேசுறேன்.",
  "Customer: வணக்கம். Brick rate சொல்லுங்க.",
  "Sales Staff: Quantity மற்றும் delivery location சொல்ல முடியுமா?",
  "Customer: சுமார் 5000 bricks, Coimbatore site.",
].join("\n");

const complete = (text: string): GeneratedTranscription => ({
  text,
  finishReason: "STOP",
});

test("accepts a normal transcript", () => {
  assert.equal(transcriptPassesQuality(plausibleTranscript), true);
});

test("rejects normalized repeated short lines", () => {
  const repeated = Array.from({ length: 100 }, (_, index) =>
    index % 2 === 0
      ? "Customer: SEND the quotation, please!"
      : "Sales Staff: send the quotation please",
  ).join("\n");
  assert.equal(transcriptPassesQuality(repeated), false);
});

test("rejects repetition hidden in one line", () => {
  assert.equal(
    transcriptPassesQuality("Please send the quotation. ".repeat(150)),
    false,
  );
});

test("rejects MAX_TOKENS and accepts the complete retry", async () => {
  const attempts: number[] = [];
  const result = await generateValidatedTranscription(async (attempt) => {
    attempts.push(attempt);
    return attempt === 0
      ? { text: plausibleTranscript, finishReason: "MAX_TOKENS" }
      : complete(`${plausibleTranscript}\nPrimary language: English`);
  });

  assert.deepEqual(attempts, [0, 1]);
  assert.equal(result.language, "en");
});

test("rejects missing completion metadata", async () => {
  await assert.rejects(
    generateValidatedTranscription(
      async () => ({ text: plausibleTranscript }),
      { maxAttempts: 1 },
    ),
    /failed quality validation/,
  );
});

test("preserves genuine final speech mentioning English", async () => {
  const finalSpeech = "Customer: Please send details in English on WhatsApp.";
  const result = await generateValidatedTranscription(
    async () => complete(`${plausibleTranscript}\n${finalSpeech}`),
    { maxAttempts: 1 },
  );

  assert.match(result.transcript, /details in English/);
  assert.equal(result.language, "unknown");
});

test("parses only a strict language footer", async () => {
  const result = await generateValidatedTranscription(
    async () =>
      complete(`${plausibleTranscript}\nPrimary language: Tamil-English mixed`),
    { maxAttempts: 1 },
  );
  assert.equal(result.transcript, plausibleTranscript);
  assert.equal(result.language, "ta-en");
});

test("enforces attempt timeout", async () => {
  await assert.rejects(
    generateValidatedTranscription(
      async () => new Promise<GeneratedTranscription>(() => undefined),
      { maxAttempts: 1, attemptTimeoutMs: 5, totalTimeoutMs: 10 },
    ),
    /timed out/,
  );
});
