import { describe, expect, it } from "vitest";

import {
  getRecordingUploadOutage,
  RECORDING_UPLOAD_PAUSED_MESSAGE,
} from "./recording-upload-outage";

describe("getRecordingUploadOutage", () => {
  it("acknowledges Telegram updates when Supabase restricts egress", () => {
    const outage = getRecordingUploadOutage({
      message:
        "Service for this project is restricted due to the following violations: exceed_egress_quota. The project owner must upgrade their plan or remove spend caps to restore service.",
    });

    expect(outage).toEqual({
      acknowledgeTelegramUpdate: true,
      message: RECORDING_UPLOAD_PAUSED_MESSAGE,
    });
  });

  it.each([
    { code: "exceed_egress_quota" },
    { details: "EXCEED_EGRESS_QUOTA" },
    { hint: "Provider code: exceed_egress_quota" },
    { cause: new Error("exceed_egress_quota") },
    { cause: { code: "exceed_egress_quota" } },
  ])("classifies the exact quota identifier in structured error fields", (error) => {
    expect(getRecordingUploadOutage(error)).toEqual({
      acknowledgeTelegramUpdate: true,
      message: RECORDING_UPLOAD_PAUSED_MESSAGE,
    });
  });

  it.each([
    { message: "connection timed out" },
    { message: "restricted while checking egress quota" },
    { code: "exceed_egress_quota_backup" },
    { details: "egress quota exceeded without a provider code" },
  ])("does not classify unrelated or near-match errors", (error) => {
    expect(getRecordingUploadOutage(error)).toBeNull();
  });
});

describe("RECORDING_UPLOAD_PAUSED_MESSAGE", () => {
  it("clearly states that the file was not saved and when to retry", () => {
    expect(RECORDING_UPLOAD_PAUSED_MESSAGE).toContain("4 October");
    expect(RECORDING_UPLOAD_PAUSED_MESSAGE).toContain("was *not saved*");
    expect(RECORDING_UPLOAD_PAUSED_MESSAGE).toContain("Please do not retry now");
  });
});
