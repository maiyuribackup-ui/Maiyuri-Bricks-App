export const RECORDING_UPLOAD_PAUSED_MESSAGE =
  `⚠️ *Recording Upload Temporarily Paused*\n\n` +
  `Recording uploads will resume on *4 October*.\n\n` +
  `This recording was *not saved*. Please keep the original file safely and upload it again after service resumes.\n\n` +
  `Please do not retry now.`;

export interface RecordingUploadOutage {
  acknowledgeTelegramUpdate: true;
  message: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

export function getRecordingUploadOutage(
  error: unknown,
): RecordingUploadOutage | null {
  const message = getErrorMessage(error).toLowerCase();
  const isEgressRestriction =
    message.includes("exceed_egress_quota") ||
    (message.includes("restricted") && message.includes("egress quota"));

  if (!isEgressRestriction) return null;

  return {
    acknowledgeTelegramUpdate: true,
    message: RECORDING_UPLOAD_PAUSED_MESSAGE,
  };
}
