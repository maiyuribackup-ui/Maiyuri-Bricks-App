import type { HealthStatus } from "./types";
import { THRESHOLDS } from "./types";

export const DEFAULT_HEALTH_MODELS = {
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-3.5-flash-lite",
} as const;

type HealthModelEnvironment = Record<string, string | undefined> & {
  HEALTH_ANTHROPIC_MODEL?: string;
  HEALTH_GEMINI_MODEL?: string;
};

export function getHealthModels(
  environment: HealthModelEnvironment = process.env,
): { anthropic: string; gemini: string } {
  return {
    anthropic:
      environment.HEALTH_ANTHROPIC_MODEL ?? DEFAULT_HEALTH_MODELS.anthropic,
    gemini: environment.HEALTH_GEMINI_MODEL ?? DEFAULT_HEALTH_MODELS.gemini,
  };
}

type WorkerPipelineCounts = {
  actionableQueueCount: number;
  recentFailureCount: number;
  permanentFailureCount: number;
};

export function getWorkerPipelineStatus(
  counts: WorkerPipelineCounts,
): HealthStatus {
  if (
    counts.actionableQueueCount > THRESHOLDS.worker.unhealthyPending ||
    counts.recentFailureCount > THRESHOLDS.worker.unhealthyFailed
  ) {
    return "unhealthy";
  }

  if (
    counts.actionableQueueCount >= THRESHOLDS.worker.degradedPending ||
    counts.recentFailureCount >= THRESHOLDS.worker.degradedFailed
  ) {
    return "degraded";
  }

  return "healthy";
}
