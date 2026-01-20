/**
 * Event Nudge Trigger
 *
 * Triggers event-driven nudges after call recording processing completes.
 * Sends a "call_recording_processed" nudge to notify staff to review.
 */

import { logProgress, logError } from "./logger.js";

interface TriggerNudgeOptions {
  leadId: string;
  recordingId: string;
  summary?: string;
  objections?: string[];
}

/**
 * Trigger call_recording_processed nudge via API
 */
export async function triggerCallRecordingNudge(
  options: TriggerNudgeOptions,
): Promise<boolean> {
  const { leadId, recordingId, summary, objections } = options;

  // Check if nudges are enabled
  const nudgesEnabled = process.env.POST_PROCESSING_NUDGE_ENABLED !== "false";
  if (!nudgesEnabled) {
    logProgress(recordingId, "Post-processing nudges disabled, skipping");
    return false;
  }

  // Get API endpoint base URL
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://maiyuri-bricks-app.vercel.app";

  const nudgeUrl = `${baseUrl}/api/nudges/events`;

  logProgress(recordingId, "Triggering call_recording_processed nudge", {
    leadId,
    url: nudgeUrl,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(nudgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "call_recording_processed",
        lead_id: leadId,
        metadata: {
          recording_id: recordingId,
          summary: summary?.slice(0, 500),
          objections: objections?.slice(0, 5),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logError(
        `Failed to trigger call_recording_processed nudge: HTTP ${response.status}`,
        {
          recordingId,
          leadId,
          error: errorText,
        },
      );
      return false;
    }

    const result = await response.json();

    if (result.nudge_sent) {
      logProgress(
        recordingId,
        "call_recording_processed nudge sent successfully",
        {
          leadId,
        },
      );
    } else {
      logProgress(
        recordingId,
        "Nudge skipped (recently sent or no recipient)",
        {
          leadId,
          message: result.message,
        },
      );
    }

    return result.nudge_sent;
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout = error instanceof Error && error.name === "AbortError";
    const errorMessage = isTimeout
      ? "Request timeout (30s)"
      : error instanceof Error
        ? error.message
        : String(error);

    logError("Error triggering call_recording_processed nudge", {
      recordingId,
      leadId,
      error: errorMessage,
    });

    return false;
  }
}

/**
 * Trigger objection_detected nudge via API
 */
export async function triggerObjectionNudge(
  options: TriggerNudgeOptions,
): Promise<boolean> {
  const { leadId, recordingId, objections } = options;

  // Only trigger if objections were detected
  if (!objections || objections.length === 0) {
    return false;
  }

  // Get API endpoint base URL
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://maiyuri-bricks-app.vercel.app";

  const nudgeUrl = `${baseUrl}/api/nudges/events`;

  logProgress(recordingId, "Triggering objection_detected nudge", {
    leadId,
    objectionCount: objections.length,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(nudgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "objection_detected",
        lead_id: leadId,
        metadata: {
          recording_id: recordingId,
          objections: objections.slice(0, 5),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logError(
        `Failed to trigger objection_detected nudge: HTTP ${response.status}`,
        {
          recordingId,
          leadId,
        },
      );
      return false;
    }

    const result = await response.json();
    return result.nudge_sent;
  } catch (error) {
    clearTimeout(timeoutId);
    logError("Error triggering objection_detected nudge", {
      recordingId,
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
