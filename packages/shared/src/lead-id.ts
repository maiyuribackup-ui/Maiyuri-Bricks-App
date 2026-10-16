const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLeadId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function leadPathFromUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/leads\/([^/]+)$/.exec(value);
  return match && isLeadId(match[1]) ? value : null;
}

const SAFE_NOTIFICATION_PATHS = new Set([
  "/dashboard",
  "/deliveries",
  "/leads",
  "/onehub",
  "/onehub/expenses",
  "/onehub/my-work",
  "/plan",
  "/production",
]);

export function safeNotificationPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (SAFE_NOTIFICATION_PATHS.has(value)) return value;

  const leadPath = leadPathFromUrl(value);
  if (leadPath) return leadPath;

  const workMatch = /^\/onehub\/my-work\/([^/]+)$/.exec(value);
  return workMatch && isLeadId(workMatch[1]) ? value : null;
}
