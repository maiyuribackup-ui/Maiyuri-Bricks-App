/**
 * Structured Logger for Call Recording Processor
 */

export function log(message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logLine = data
    ? `[${timestamp}] ${message} ${JSON.stringify(data)}`
    : `[${timestamp}] ${message}`;
  console.log(logLine);
}

export function logError(message: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[${timestamp}] ERROR: ${message}`, {
    error: errorMessage,
    stack: errorStack,
  });
}

export function logProgress(
  recordingId: string,
  stage: string,
  details?: Record<string, unknown>
): void {
  log(`[${recordingId}] ${stage}`, details);
}
