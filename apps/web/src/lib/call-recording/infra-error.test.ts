import { describe, it, expect } from "vitest";
import { isInfraError } from "./notifications";

describe("isInfraError", () => {
  it("classifies AI-provider/infra outages as infra (should NOT burn a retry)", () => {
    // The exact errors seen during the 2026-06 incident:
    expect(isInfraError("[429 Too Many Requests] Your prepayment credits are depleted")).toBe(true);
    expect(isInfraError("[400 Bad Request] API key expired. Please renew the API key.")).toBe(true);
    expect(isInfraError("API_KEY_INVALID")).toBe(true);
    expect(isInfraError("RESOURCE_EXHAUSTED: quota exceeded")).toBe(true);
    expect(isInfraError("503 Service Unavailable - model overloaded")).toBe(true);
    expect(isInfraError("fetch failed")).toBe(true);
    expect(isInfraError("ETIMEDOUT")).toBe(true);
  });

  it("treats genuine per-recording failures as NOT infra (so they consume a retry + alert)", () => {
    expect(isInfraError("No JSON found in response")).toBe(false);
    expect(isInfraError("Telegram file download failed: file not found")).toBe(false);
    expect(isInfraError("Unsupported audio format")).toBe(false);
    expect(isInfraError("")).toBe(false);
  });
});
