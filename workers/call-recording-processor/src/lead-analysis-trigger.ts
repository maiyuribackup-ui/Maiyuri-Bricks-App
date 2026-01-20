/**
 * Lead Analysis Trigger
 *
 * Triggers full lead analysis after call recording processing completes.
 * This eliminates the need for users to manually click "Analyze" in the app.
 */

import { logProgress, logError } from "./logger.js";

interface TriggerAnalysisOptions {
  leadId: string;
  recordingId: string;
}

// In-memory cache to track recent analysis triggers (prevents hammering)
const recentTriggers = new Map<string, number>();
const DEBOUNCE_WINDOW_MS = 60000; // 1 minute

/**
 * Check if we recently triggered analysis for this lead
 */
function shouldDebounce(leadId: string): boolean {
  const lastTrigger = recentTriggers.get(leadId);

  if (!lastTrigger) {
    return false;
  }

  const elapsed = Date.now() - lastTrigger;
  return elapsed < DEBOUNCE_WINDOW_MS;
}

/**
 * Record that we triggered analysis for this lead
 */
function recordTrigger(leadId: string): void {
  recentTriggers.set(leadId, Date.now());

  // Clean up old entries (older than 5 minutes)
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, timestamp] of recentTriggers.entries()) {
    if (timestamp < cutoff) {
      recentTriggers.delete(key);
    }
  }
}

/**
 * Trigger lead analysis via API
 *
 * This calls the existing /api/leads/[id]/analyze endpoint which runs:
 * - Full AI analysis (scoring, summary, suggestions)
 * - Task creation from AI suggestions
 * - Telegram notification with analysis details
 */
export async function triggerLeadAnalysis(
  options: TriggerAnalysisOptions,
): Promise<boolean> {
  const { leadId, recordingId } = options;

  // Check if auto-trigger is enabled
  const autoTrigger = process.env.AUTO_TRIGGER_ANALYSIS === "true";
  if (!autoTrigger) {
    logProgress(recordingId, "Auto-trigger disabled, skipping analysis");
    return false;
  }

  // Check debouncing
  if (shouldDebounce(leadId)) {
    logProgress(
      recordingId,
      `Debouncing analysis for lead ${leadId} (triggered recently)`,
    );
    return false;
  }

  // Get API endpoint base URL
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://maiyuri-bricks-app.vercel.app";

  const analysisUrl = `${baseUrl}/api/leads/${leadId}/analyze`;

  logProgress(recordingId, "Triggering lead analysis", {
    leadId,
    url: analysisUrl,
  });

  // Get service role key for authentication
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    logError("Missing SUPABASE_SERVICE_ROLE_KEY for API calls", {
      recordingId,
    });
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(analysisUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "X-Recording-ID": recordingId, // Track which recording triggered this
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

    // Record this trigger to prevent duplicates
    recordTrigger(leadId);

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
