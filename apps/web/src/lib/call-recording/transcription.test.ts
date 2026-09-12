import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Gemini SDK so no real network call is made. `generateContent` is a
// per-test spy; the class just hands back a model that delegates to it.
const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

import { transcribeAudio, transcriptionBackoffMs } from "./transcription";

const FIVE_OH_THREE =
  "[GoogleGenerativeAI Error]: [503 Service Unavailable] This model is currently experiencing high demand";

function okResponse(text: string) {
  return { response: { text: () => text } };
}

const audio = Buffer.from("fake-audio-bytes");

beforeEach(() => {
  generateContent.mockReset();
  process.env.GOOGLE_AI_API_KEY = "test-key";
  // Deterministic backoff (no jitter) so timing assertions are exact.
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("transcribeAudio — transient-503 retry with backoff", () => {
  it("retries a transient 503 and succeeds on a later attempt", async () => {
    generateContent
      .mockRejectedValueOnce(new Error(FIVE_OH_THREE))
      .mockRejectedValueOnce(new Error(FIVE_OH_THREE))
      .mockResolvedValueOnce(okResponse("Customer: hello\nTamil"));

    const promise = transcribeAudio(audio, "call.mp3");
    await vi.runAllTimersAsync(); // let the backoff sleeps elapse

    const result = await promise;
    expect(result.text).toContain("hello");
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("fails fast on a permanent (non-infra) error — no retries", async () => {
    generateContent.mockRejectedValue(new Error("Invalid argument: malformed audio content"));

    const promise = transcribeAudio(audio, "call.mp3");
    await expect(promise).rejects.toThrow(/malformed audio/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("exhausts all attempts on a sustained outage, then rethrows the original error", async () => {
    generateContent.mockRejectedValue(new Error(FIVE_OH_THREE));

    const promise = transcribeAudio(audio, "call.mp3");
    // Attach a rejection handler up front so the eventual reject isn't "unhandled".
    const settled = expect(promise).rejects.toThrow(/503/);
    await vi.runAllTimersAsync();
    await settled;
    expect(generateContent).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });
});

describe("transcriptionBackoffMs", () => {
  it("is exponential (1s, 2s, 4s) with zero jitter", () => {
    // Math.random is mocked to 0 in beforeEach → jitter contributes nothing.
    expect(transcriptionBackoffMs(1)).toBe(1000);
    expect(transcriptionBackoffMs(2)).toBe(2000);
    expect(transcriptionBackoffMs(3)).toBe(4000);
  });

  it("adds bounded jitter (never exceeds one base interval)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    // exponential(1) = 1000, jitter < 1000 → strictly within [1000, 2000)
    const d = transcriptionBackoffMs(1);
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThan(2000);
  });
});
