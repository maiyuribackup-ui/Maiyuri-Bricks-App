/**
 * Call Recording Processor Logger
 *
 * Thin console wrapper with [CallProcessor] prefix for easy log filtering.
 */

const PREFIX = "[CallProcessor]";

export function log(message: string, data?: Record<string, unknown>): void {
  const logLine = data
    ? `${PREFIX} ${message} ${JSON.stringify(data)}`
    : `${PREFIX} ${message}`;
  console.log(logLine);
}

export function logError(message: string, error: unknown): void {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? JSON.stringify(error)
        : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`${PREFIX} ERROR: ${message}`, {
    error: errorMessage,
    stack: errorStack,
  });
}

export function logProgress(
  recordingId: string,
  stage: string,
  details?: Record<string, unknown>,
): void {
  log(`[${recordingId}] ${stage}`, details);
}
