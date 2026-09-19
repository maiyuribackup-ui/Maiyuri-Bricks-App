export const DEFAULT_FAILED_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Build the persisted updated_at cutoff used to make failed work retryable.
 * Invalid configuration falls back safely instead of crashing the poll loop.
 */
export function getFailedRetryCutoff(
  nowMs = Date.now(),
  cooldownMs = DEFAULT_FAILED_RETRY_COOLDOWN_MS,
): string {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const safeCooldown =
    Number.isFinite(cooldownMs) && cooldownMs >= 0
      ? cooldownMs
      : DEFAULT_FAILED_RETRY_COOLDOWN_MS;

  return new Date(safeNow - safeCooldown).toISOString();
}

export function buildRetryEligibilityFilter(failedRetryCutoff: string): string {
  return `processing_status.eq.pending,and(processing_status.eq.failed,updated_at.lte.${failedRetryCutoff})`;
}
