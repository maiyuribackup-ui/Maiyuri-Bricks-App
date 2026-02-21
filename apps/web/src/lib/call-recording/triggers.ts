/**
 * Post-Processing Triggers
 *
 * Triggers lead analysis and event nudges after call recording processing.
 * Merged from worker's lead-analysis-trigger.ts and event-nudge-trigger.ts.
 * No in-memory debounce (useless in serverless).
 */

import { logProgress, logError } from "./logger";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://maiyuri-bricks-app.vercel.app";

interface TriggerAnalysisOptions {
  leadId: string;
  recordingId: string;
}

interface TriggerNudgeOptions {
  leadId: string;
  recordingId: string;
  summary?: string;
  objections?: string[];
}

/**
 * Trigger lead analysis via API
 */
export async function triggerLeadAnalysis(
  options: TriggerAnalysisOptions,
): Promise<boolean> {
  const { leadId, recordingId } = options;

  const autoTrigger = process.env.AUTO_TRIGGER_ANALYSIS === "true";
  if (!autoTrigger) {
    logProgress(recordingId, "Auto-trigger disabled, skipping analysis");
    return false;
  }

  const analysisUrl = `${BASE_URL}/api/leads/${leadId}/analyze`;

  logProgress(recordingId, "Triggering lead analysis", {
    leadId,
    url: analysisUrl,
  });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    logError("Missing SUPABASE_SERVICE_ROLE_KEY for API calls", {
      recordingId,
    });
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(analysisUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "X-Recording-ID": recordingId,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logError(`Failed to trigger lead analysis: HTTP ${response.status}`, {
        recordingId,
        leadId,
        error: errorText,
      });
      return false;
    }

    logProgress(recordingId, "Lead analysis triggered successfully", {
      leadId,
    });

    return true;
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout = error instanceof Error && error.name === "AbortError";
    const errorMessage = isTimeout
      ? "Request timeout (60s)"
      : error instanceof Error
        ? error.message
        : String(error);

    logError("Error triggering lead analysis", {
      recordingId,
      leadId,
      error: errorMessage,
    });

    return false;
  }
}

/**
 * Trigger call_recording_processed nudge
 */
export async function triggerCallRecordingNudge(
  options: TriggerNudgeOptions,
): Promise<boolean> {
  const { leadId, recordingId, summary, objections } = options;

  const nudgesEnabled = process.env.POST_PROCESSING_NUDGE_ENABLED !== "false";
  if (!nudgesEnabled) {
    logProgress(recordingId, "Post-processing nudges disabled, skipping");
    return false;
  }

  const nudgeUrl = `${BASE_URL}/api/nudges/events`;

  logProgress(recordingId, "Triggering call_recording_processed nudge", {
    leadId,
    url: nudgeUrl,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(nudgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        { recordingId, leadId, error: errorText },
      );
      return false;
    }

    const result = (await response.json()) as { nudge_sent?: boolean; message?: string };

    if (result.nudge_sent) {
      logProgress(recordingId, "call_recording_processed nudge sent", { leadId });
    } else {
      logProgress(recordingId, "Nudge skipped (recently sent or no recipient)", {
        leadId,
        message: result.message,
      });
    }

    return result.nudge_sent ?? false;
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
 * Trigger objection_detected nudge
 */
export async function triggerObjectionNudge(
  options: TriggerNudgeOptions,
): Promise<boolean> {
  const { leadId, recordingId, objections } = options;

  if (!objections || objections.length === 0) {
    return false;
  }

  const nudgeUrl = `${BASE_URL}/api/nudges/events`;

  logProgress(recordingId, "Triggering objection_detected nudge", {
    leadId,
    objectionCount: objections.length,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(nudgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        { recordingId, leadId },
      );
      return false;
    }

    const result = (await response.json()) as { nudge_sent?: boolean };
    return result.nudge_sent ?? false;
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
