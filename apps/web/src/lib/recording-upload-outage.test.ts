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

  it("does not classify unrelated database errors as the temporary outage", () => {
    expect(getRecordingUploadOutage({ message: "connection timed out" })).toBeNull();
  });
});

describe("RECORDING_UPLOAD_PAUSED_MESSAGE", () => {
  it("clearly states that the file was not saved and when to retry", () => {
    expect(RECORDING_UPLOAD_PAUSED_MESSAGE).toContain("4 October");
    expect(RECORDING_UPLOAD_PAUSED_MESSAGE).toContain("was *not saved*");
    expect(RECORDING_UPLOAD_PAUSED_MESSAGE).toContain("Please do not retry now");
  });
});
