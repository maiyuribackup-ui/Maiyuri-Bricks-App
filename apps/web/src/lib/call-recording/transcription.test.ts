import { describe, expect, it } from "vitest";
import {
  generateValidatedTranscription,
  transcriptPassesQuality,
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

describe("transcriptPassesQuality", () => {
  it("accepts a plausible Tamil-English sales-call transcript", () => {
    expect(transcriptPassesQuality(plausibleTranscript)).toBe(true);
  });

  it("rejects repeated-line hallucination loops", () => {
    expect(transcriptPassesQuality(repeatedHallucination)).toBe(false);
  });

  it("rejects implausibly large single-segment transcripts", () => {
    expect(transcriptPassesQuality("word ".repeat(2_000))).toBe(false);
  });
});

describe("generateValidatedTranscription", () => {
  it("retries a corrupt response and returns the first valid transcript", async () => {
    const responses = [
      `${repeatedHallucination}\nTamil-English mixed`,
      `${plausibleTranscript}\nTamil-English mixed`,
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

  it("fails closed when every response is corrupt", async () => {
    await expect(
      generateValidatedTranscription(
        async () => `${repeatedHallucination}\nTamil-English mixed`,
        3,
      ),
    ).rejects.toThrow("failed quality validation after 3 attempts");
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
    const oversizedTail = "Tamil-English mixed ".repeat(500);

    await expect(
      generateValidatedTranscription(
        async () => `${plausibleTranscript}\n${oversizedTail}`,
        1,
      ),
    ).rejects.toThrow("failed quality validation after 1 attempts");
  });
});
