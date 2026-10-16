import assert from "node:assert/strict";
import test from "node:test";
import type { GoogleGenerativeAI } from "@google/generative-ai";

import {
  isTranscriptionInfrastructureError,
  toSafeProviderError,
  transcribeAudioWithClient,
  TRANSCRIPTION_MODELS,
} from "./transcription.js";

const plausibleTranscript = [
  "Sales Staff: வணக்கம் சார், Maiyuri Bricks-லிருந்து பேசுறேன்.",
  "Customer: வணக்கம். Brick rate சொல்லுங்க.",
  "Sales Staff: Quantity மற்றும் delivery location சொல்ல முடியுமா?",
  "Customer: சுமார் 5000 bricks, Coimbatore site.",
].join("\n");

interface FakeResponse {
  text: string;
  finishReason: string;
}

function fakeClient(
  responses: Array<FakeResponse | Error>,
  requestedModels: string[],
): GoogleGenerativeAI {
  return {
    getGenerativeModel: ({ model }: { model: string }) => ({
      generateContent: async () => {
        requestedModels.push(model);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        if (!response) throw new Error("No fake Gemini response configured");
        return {
          response: {
            text: () => response.text,
            candidates: [{ finishReason: response.finishReason }],
          },
        };
      },
    }),
  } as unknown as GoogleGenerativeAI;
}

test("uses supported canonical models and retries incomplete output", async () => {
  const requestedModels: string[] = [];
  const client = fakeClient(
    [
      { text: plausibleTranscript, finishReason: "MAX_TOKENS" },
      {
        text: `${plausibleTranscript}\nPrimary language: Tamil-English mixed`,
        finishReason: "STOP",
      },
    ],
    requestedModels,
  );

  const result = await transcribeAudioWithClient(
    Buffer.from("fake audio"),
    "call.ogg",
    client,
  );

  assert.equal(requestedModels.join(",").includes("gemini-2.0-flash"), false);
  assert.deepEqual(requestedModels, [...TRANSCRIPTION_MODELS]);
  assert.equal(result.text, plausibleTranscript);
  assert.equal(result.language, "ta-en");
});

test("provider failures propagate immediately without trying another model", async () => {
  const requestedModels: string[] = [];
  const privateDetail = "private-customer-call-detail";
  const client = fakeClient(
    [new Error(`fetch failed while sending ${privateDetail}`)],
    requestedModels,
  );

  await assert.rejects(
    transcribeAudioWithClient(Buffer.from("fake audio"), "call.ogg", client),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "Gemini transcription provider network failure",
      );
      assert.equal(error.message.includes(privateDetail), false);
      assert.equal(isTranscriptionInfrastructureError(error), true);
      return true;
    },
  );
  assert.deepEqual(requestedModels, [TRANSCRIPTION_MODELS[0]]);
});

test("safe provider errors retain infrastructure categories without secrets", () => {
  const credentialError = toSafeProviderError({
    status: 401,
    message: "API key secret-value is invalid",
  });
  const modelError = toSafeProviderError({
    status: 404,
    message: "retired model with private request details",
  });
  const malformedRequest = toSafeProviderError({ status: 400, message: "bad" });

  assert.equal(
    credentialError.message,
    "Gemini transcription provider API key invalid (401)",
  );
  assert.equal(
    modelError.message,
    "Gemini transcription provider model unavailable (404)",
  );
  assert.equal(isTranscriptionInfrastructureError(credentialError), true);
  assert.equal(isTranscriptionInfrastructureError(modelError), true);
  assert.equal(isTranscriptionInfrastructureError(malformedRequest), false);
  const expiredKey = toSafeProviderError({
    status: 400,
    message: "API key expired for customer@example.com",
  });
  assert.equal(
    expiredKey.message,
    "Gemini transcription provider API key invalid (400)",
  );
  assert.equal(expiredKey.message.includes("customer@example.com"), false);
  assert.equal(isTranscriptionInfrastructureError(expiredKey), true);
  assert.equal(
    `${credentialError.message} ${modelError.message}`.includes("secret-value"),
    false,
  );
});
