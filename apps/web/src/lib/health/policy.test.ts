import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_MODELS,
  getHealthModels,
  getWorkerPipelineStatus,
} from "./policy";
import { CRON_EXPECTED_INTERVALS } from "./types";

describe("health monitoring policy", () => {
  it("uses live-verified model defaults and allows explicit overrides", () => {
    expect(DEFAULT_HEALTH_MODELS).toEqual({
      anthropic: "claude-haiku-4-5-20251001",
      gemini: "gemini-3.5-flash-lite",
    });
    expect(
      getHealthModels({
        HEALTH_ANTHROPIC_MODEL: "claude-test",
        HEALTH_GEMINI_MODEL: "gemini-test",
      }),
    ).toEqual({ anthropic: "claude-test", gemini: "gemini-test" });
  });

  it("falls back to safe defaults for blank model overrides", () => {
    expect(
      getHealthModels({
        HEALTH_ANTHROPIC_MODEL: "  ",
        HEALTH_GEMINI_MODEL: "",
      }),
    ).toEqual(DEFAULT_HEALTH_MODELS);
  });

  it("does not let historical permanent failures keep the live worker unhealthy", () => {
    expect(
      getWorkerPipelineStatus({
        actionableQueueCount: 0,
        recentFailureCount: 0,
        permanentFailureCount: 29,
      }),
    ).toBe("healthy");
  });

  it("degrades and fails based on actionable queue and recent failures", () => {
    expect(
      getWorkerPipelineStatus({
        actionableQueueCount: 5,
        recentFailureCount: 0,
        permanentFailureCount: 29,
      }),
    ).toBe("degraded");
    expect(
      getWorkerPipelineStatus({
        actionableQueueCount: 0,
        recentFailureCount: 6,
        permanentFailureCount: 0,
      }),
    ).toBe("unhealthy");
  });

  it("tracks only cron jobs that are actually scheduled and logged", () => {
    expect(CRON_EXPECTED_INTERVALS).toEqual({
      "nudge-digest": 24,
      "odoo-sync": 24,
      "delivery-sync": 24,
    });
  });
});
