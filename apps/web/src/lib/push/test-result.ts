/**
 * Interpret the result of POST /api/push/test into a UI state + message.
 *
 * Extracted as a pure function so the diagnostics UI logic is unit-testable and
 * so delivery failures (configured + failed>0) are not misreported as "no
 * devices registered".
 */
export interface PushTestData {
  configured?: boolean;
  sent?: number;
  failed?: number;
}

export interface PushTestOutcome {
  state: "sent" | "error";
  message: string;
}

export function interpretPushTest(data: PushTestData): PushTestOutcome {
  const sent = data.sent ?? 0;
  const failed = data.failed ?? 0;

  if (!data.configured) {
    return {
      state: "error",
      message: "Push is not configured on the server yet.",
    };
  }
  if (sent > 0) {
    return {
      state: "sent",
      message: `Sent to ${sent} device(s). Check your notifications.`,
    };
  }
  if (failed > 0) {
    return {
      state: "error",
      message: `Push delivery failed for ${failed} device(s). Re-register notifications and check the push logs.`,
    };
  }
  return {
    state: "error",
    message:
      "No devices registered for your account. Open the Android app and allow notifications, then try again.",
  };
}
