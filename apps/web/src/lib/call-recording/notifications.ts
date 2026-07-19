/**
 * Call Recording Notification Service
 *
 * Sends rich call analysis notifications to Telegram.
 * Delegates actual sending to the centralized @/lib/telegram module.
 */

import { sendTelegramMessage } from "@/lib/telegram";
import { log, logError } from "./logger";
import type { CallInsights, ExtractedLeadDetails, NotificationData } from "./types";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://maiyuri-bricks-app.vercel.app";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getSentimentEmoji(sentiment?: string): string {
  switch (sentiment) {
    case "positive":
      return "\u{1F7E2}"; // green circle
    case "negative":
      return "\u{1F534}"; // red circle
    case "mixed":
      return "\u{1F7E1}"; // yellow circle
    default:
      return "\u26AA"; // white circle
  }
}

function getScoreImpactIndicator(impact: number): string {
  if (impact > 0.1) return `\u{1F4C8} +${Math.round(impact * 100)}%`;
  if (impact < -0.1) return `\u{1F4C9} ${Math.round(impact * 100)}%`;
  return "\u27A1\uFE0F 0%";
}

function buildInsightsSection(insights: CallInsights): string {
  const sections: string[] = [];

  const concerns = [
    ...(insights.complaints ?? []),
    ...(insights.negative_feedback ?? []),
  ].slice(0, 3);

  if (concerns.length > 0) {
    sections.push(
      `\u{1F534} *Concerns:*\n${concerns.map((c) => `\u2022 ${c}`).join("\n")}`,
    );
  }

  const negotiation = [
    ...(insights.negotiation_signals ?? []),
    ...(insights.price_expectations ?? []),
  ].slice(0, 3);

  if (negotiation.length > 0) {
    sections.push(
      `\u{1F7E1} *Negotiation Signals:*\n${negotiation.map((n) => `\u2022 ${n}`).join("\n")}`,
    );
  }

  if (insights.positive_signals && insights.positive_signals.length > 0) {
    sections.push(
      `\u{1F7E2} *Positive Signals:*\n${insights.positive_signals
        .slice(0, 3)
        .map((p) => `\u2022 ${p}`)
        .join("\n")}`,
    );
  }

  if (insights.recommended_actions && insights.recommended_actions.length > 0) {
    sections.push(
      `\u{1F3AF} *Recommended Action:*\n${insights.recommended_actions
        .slice(0, 2)
        .map((a) => `\u2022 ${a}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

function formatLabel(value: string | null): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildLeadDetailsSection(
  details: ExtractedLeadDetails,
  isNewlyPopulated: boolean,
): string {
  const lines: string[] = [];

  if (isNewlyPopulated) {
    lines.push(`\u2728 *Lead Details Auto-Populated:*\n`);
  } else {
    lines.push(`\u{1F4CB} *Extracted Lead Details:*\n`);
  }

  if (details.lead_type && details.lead_type !== "Other") {
    lines.push(`\u{1F3F7}\uFE0F Type: ${details.lead_type}`);
  }
  if (details.classification && details.classification !== "direct_customer") {
    lines.push(`\u{1F465} Classification: ${formatLabel(details.classification)}`);
  }
  if (details.requirement_type) {
    lines.push(`\u{1F3D7}\uFE0F Requirement: ${formatLabel(details.requirement_type)}`);
  }
  if (details.site_region) {
    lines.push(`\u{1F4CD} Region: ${details.site_region}`);
  }
  if (details.site_location) {
    lines.push(`\u{1F5FA}\uFE0F Location: ${details.site_location}`);
  }
  if (details.estimated_quantity) {
    lines.push(
      `\u{1F4E6} Est. Quantity: ${details.estimated_quantity.toLocaleString()} bricks`,
    );
  }
  if (details.next_action) {
    lines.push(`\u{1F4CB} Next Action: ${details.next_action}`);
  }
  if (details.notes) {
    lines.push(`\u{1F4DD} Notes: ${details.notes}`);
  }

  if (lines.length <= 1) return "";

  return lines.join("\n");
}

/**
 * Send call recording processed notification
 */
export async function sendCallRecordingNotification(
  chatId: string,
  data: NotificationData,
): Promise<boolean> {
  const {
    leadName,
    leadId,
    phoneNumber,
    duration,
    summary,
    insights,
    scoreImpact,
    driveUrl,
    extractedDetails,
    isNewlyAutoPopulated,
  } = data;

  const sentimentEmoji = getSentimentEmoji(insights.sentiment);
  const scoreIndicator = getScoreImpactIndicator(scoreImpact);

  let message = `\u{1F4DE} *New Call Recording Processed*\n\n`;

  if (leadName) {
    message += `\u{1F464} *Lead:* ${leadName}\n`;
  }
  message += `\u{1F4F1} *Phone:* ${phoneNumber}\n`;
  message += `\u23F1\uFE0F *Duration:* ${formatDuration(duration)}\n`;
  message += `${sentimentEmoji} *Sentiment:* ${(insights.sentiment ?? "neutral").toUpperCase()}\n\n`;

  message += `\u{1F4DD} *AI Summary:*\n${summary}\n\n`;

  if (extractedDetails) {
    const detailsSection = buildLeadDetailsSection(
      extractedDetails,
      isNewlyAutoPopulated ?? false,
    );
    if (detailsSection) {
      message += detailsSection + "\n\n";
    }
  }

  const insightsSection = buildInsightsSection(insights);
  if (insightsSection) {
    message += insightsSection + "\n\n";
  }

  message += `\u{1F525} *Conversion Score Impact:* ${scoreIndicator}\n\n`;

  if (driveUrl) {
    message += `\u{1F3A7} [Listen to Recording](${driveUrl})\n`;
  }
  if (leadId) {
    message += `\u{1F4CB} [View Lead](${APP_URL}/leads/${leadId})\n`;
  }

  if (extractedDetails) {
    const missingFields: string[] = [];
    if (!extractedDetails.site_region) missingFields.push("Region");
    if (!extractedDetails.site_location) missingFields.push("Location");
    if (!extractedDetails.estimated_quantity) missingFields.push("Quantity");

    if (missingFields.length > 0) {
      message += `\n\u{1F4AC} _Need more details? Missing: ${missingFields.join(", ")}_\n`;
      message += `_Reply with updates to add manually._`;
    } else {
      message += `\n\u2705 _All key lead details captured!_`;
    }
  }

  const result = await sendTelegramMessage(message.trim(), chatId);

  if (result.success) {
    log("Notification sent", {
      chatId,
      leadName,
      phoneNumber,
      isNewlyAutoPopulated,
    });
  } else {
    logError("Failed to send notification", result.error ?? "Unknown error");
  }

  return result.success;
}

/**
 * Send error notification to admin
 */
export async function sendErrorNotification(
  recordingId: string,
  error: string,
): Promise<void> {
  const adminChatId =
    process.env.TELEGRAM_ADMIN_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;

  if (!adminChatId) return;

  const message =
    `\u{1F6A8} *Call Recording Processing Failed*\n\n` +
    `\u{1F4CB} *Recording ID:* \`${recordingId}\`\n` +
    `\u274C *Error:* ${error.slice(0, 200)}\n\n` +
    `Please check the logs for details.`;

  await sendTelegramMessage(message, adminChatId);
}

/**
 * A recording exhausted all retries \u2014 the call's insights are LOST unless a
 * human intervenes. Loud and specific: before this alert existed, 8 real
 * customer calls failed permanently with nobody told.
 */
export async function sendPermanentFailureAlert(
  filename: string,
  phoneNumber: string,
  error: string,
): Promise<void> {
  const adminChatId =
    process.env.TELEGRAM_ADMIN_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;
  if (!adminChatId) return;

  const message =
    `\u274C *GIVING UP on a call recording (3 attempts failed)*\n\n` +
    `\u{1F4C1} ${filename}\n` +
    `\u{1F4F1} ${phoneNumber}\n` +
    `\u26A0\uFE0F Error: ${error.slice(0, 160)}\n\n` +
    `This call's insights are NOT captured. Fix the cause, then re-upload the ` +
    `file to Telegram (or reset it from the admin console).`;

  await sendTelegramMessage(message, adminChatId);
}

/**
 * Classify an error as an infrastructure / AI-provider outage rather than a
 * problem with a specific recording. These (depleted credits, expired/invalid
 * key, quota/rate limits, 5xx, network) are transient and NOT the recording's
 * fault — so they must not burn its retry budget, and they should produce one
 * throttled alert instead of one-per-recording spam.
 */
export function isInfraError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return /\b429\b|resource_exhausted|prepayment credits|depleted|quota|rate.?limit|api key expired|api_key_invalid|api key not valid|\b5\d\d\b|overload|unavailable|timeout|timed ?out|fetch failed|econnreset|enotfound|network/.test(
    m,
  );
}

/**
 * One aggregated alert for an AI-provider/infra outage affecting N recordings —
 * replaces the per-recording failure spam. The recordings are left pending with
 * their retry budget intact, so they auto-resume once the outage clears.
 */
export async function sendInfraOutageAlert(
  count: number,
  sampleError: string,
): Promise<void> {
  const adminChatId =
    process.env.TELEGRAM_ADMIN_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;

  if (!adminChatId) return;

  const message =
    `\u{26A0}\u{FE0F} *Call recording processing paused*\n\n` +
    `${count} recording(s) hit an AI-provider/infra error and were left *pending* — no retry consumed, they will auto-resume once it clears.\n\n` +
    `\u{1F4A1} *Cause:* ${sampleError.slice(0, 180)}`;

  await sendTelegramMessage(message, adminChatId);
}
