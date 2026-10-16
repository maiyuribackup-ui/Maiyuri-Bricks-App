export const RECORDING_UPLOAD_PAUSED_MESSAGE =
  `⚠️ *Recording Upload Temporarily Paused*\n\n` +
  `Recording uploads will resume on *4 October*.\n\n` +
  `This recording was *not saved*. Please keep the original file safely and upload it again after service resumes.\n\n` +
  `Please do not retry now.`;

export interface RecordingUploadOutage {
  acknowledgeTelegramUpdate: true;
  message: string;
}

const QUOTA_IDENTIFIER = /(?:^|\W)exceed_egress_quota(?:$|\W)/i;
const ERROR_FIELDS = ["message", "code", "details", "hint", "cause"] as const;

function containsQuotaIdentifier(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): boolean {
  if (typeof value === "string") return QUOTA_IDENTIFIER.test(value);
  if (typeof value !== "object" || value === null || depth > 5) return false;
  if (seen.has(value)) return false;

  seen.add(value);
  const errorRecord = value as Record<string, unknown>;
  return ERROR_FIELDS.some((field) =>
    containsQuotaIdentifier(errorRecord[field], seen, depth + 1),
  );
}

export function getRecordingUploadOutage(
  error: unknown,
): RecordingUploadOutage | null {
  if (!containsQuotaIdentifier(error)) return null;

  return {
    acknowledgeTelegramUpdate: true,
    message: RECORDING_UPLOAD_PAUSED_MESSAGE,
  };
}
