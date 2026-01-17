/**
 * Telegram Notification Service
 *
 * Sends rich call analysis notifications to Telegram.
 */

import { log, logError } from "./logger.js";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

// Types
interface CallInsights {
  complaints?: string[];
  negative_feedback?: string[];
  negotiation_signals?: string[];
  price_expectations?: string[];
  positive_signals?: string[];
  recommended_actions?: string[];
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
}

interface ExtractedLeadDetails {
  lead_type:
    | "Residential"
    | "Commercial"
    | "Industrial"
    | "Government"
    | "Other";
  classification:
    | "builder"
    | "dealer"
    | "architect"
    | "direct_customer"
    | "contractor"
    | "engineer";
  requirement_type:
    | "residential_house"
    | "commercial_building"
    | "compound_wall"
    | "industrial_shed"
    | "government_project"
    | "other"
    | null;
  site_region: string | null;
  site_location: string | null;
  next_action: string | null;
  estimated_quantity: number | null;
  notes: string | null;
}

interface NotificationData {
  leadName?: string;
  leadId?: string;
  phoneNumber: string;
  duration: number;
  summary: string;
  insights: CallInsights;
  scoreImpact: number;
  driveUrl: string;
  extractedDetails?: ExtractedLeadDetails;
  isNewlyAutoPopulated?: boolean;
}

/**
 * Send a message to Telegram
 */
async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    log("Telegram not configured, skipping notification");
    return false;
  }

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      },
    );

    const data = (await response.json()) as {
      ok: boolean;
      description?: string;
    };

    if (!data.ok) {
      logError("Telegram API error", data);
      return false;
    }

    return true;
  } catch (error) {
    logError("Telegram send failed", error);
    return false;
  }
}

/**
 * Format duration as mm:ss
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get sentiment emoji
 */
function getSentimentEmoji(sentiment?: string): string {
  switch (sentiment) {
    case "positive":
      return "🟢";
    case "negative":
      return "🔴";
    case "mixed":
      return "🟡";
    default:
      return "⚪";
  }
}

/**
 * Get score impact indicator
 */
function getScoreImpactIndicator(impact: number): string {
  if (impact > 0.1) return `📈 +${Math.round(impact * 100)}%`;
  if (impact < -0.1) return `📉 ${Math.round(impact * 100)}%`;
  return "➡️ 0%";
}

/**
 * Build the insights section of the message
 */
function buildInsightsSection(insights: CallInsights): string {
  const sections: string[] = [];

  // Concerns (red)
  const concerns = [
    ...(insights.complaints || []),
    ...(insights.negative_feedback || []),
  ].slice(0, 3);

  if (concerns.length > 0) {
    sections.push(
      `🔴 *Concerns:*\n${concerns.map((c) => `• ${c}`).join("\n")}`,
    );
  }

  // Negotiation signals (yellow)
  const negotiation = [
    ...(insights.negotiation_signals || []),
    ...(insights.price_expectations || []),
  ].slice(0, 3);

  if (negotiation.length > 0) {
    sections.push(
      `🟡 *Negotiation Signals:*\n${negotiation.map((n) => `• ${n}`).join("\n")}`,
    );
  }

  // Positive signals (green)
  if (insights.positive_signals && insights.positive_signals.length > 0) {
    sections.push(
      `🟢 *Positive Signals:*\n${insights.positive_signals
        .slice(0, 3)
        .map((p) => `• ${p}`)
        .join("\n")}`,
    );
  }

  // Recommended actions (target)
  if (insights.recommended_actions && insights.recommended_actions.length > 0) {
    sections.push(
      `🎯 *Recommended Action:*\n${insights.recommended_actions
        .slice(0, 2)
        .map((a) => `• ${a}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

/**
 * Format label for display (snake_case to Title Case)
 */
function formatLabel(value: string | null): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build the auto-populated lead details section
 */
function buildLeadDetailsSection(
  details: ExtractedLeadDetails,
  isNewlyPopulated: boolean,
): string {
  const lines: string[] = [];

  if (isNewlyPopulated) {
    lines.push(`✨ *Lead Details Auto-Populated:*\n`);
  } else {
    lines.push(`📋 *Extracted Lead Details:*\n`);
  }

  if (details.lead_type && details.lead_type !== "Other") {
    lines.push(`🏷️ Type: ${details.lead_type}`);
  }
  if (details.classification && details.classification !== "direct_customer") {
    lines.push(`👥 Classification: ${formatLabel(details.classification)}`);
  }
  if (details.requirement_type) {
    lines.push(`🏗️ Requirement: ${formatLabel(details.requirement_type)}`);
  }
  if (details.site_region) {
    lines.push(`📍 Region: ${details.site_region}`);
  }
  if (details.site_location) {
    lines.push(`🗺️ Location: ${details.site_location}`);
  }
  if (details.estimated_quantity) {
    lines.push(
      `📦 Est. Quantity: ${details.estimated_quantity.toLocaleString()} bricks`,
    );
  }
  if (details.next_action) {
    lines.push(`📋 Next Action: ${details.next_action}`);
  }
  if (details.notes) {
    lines.push(`📝 Notes: ${details.notes}`);
  }

  // Only return if we have actual details beyond the header
  if (lines.length <= 1) return "";

  return lines.join("\n");
}

/**
 * Send call recording processed notification
 */
export async function sendTelegramNotification(
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

  // Build the message
  const sentimentEmoji = getSentimentEmoji(insights.sentiment);
  const scoreIndicator = getScoreImpactIndicator(scoreImpact);

  let message = `📞 *New Call Recording Processed*\n\n`;

  // Lead info
  if (leadName) {
    message += `👤 *Lead:* ${leadName}\n`;
  }
  message += `📱 *Phone:* ${phoneNumber}\n`;
  message += `⏱️ *Duration:* ${formatDuration(duration)}\n`;
  message += `${sentimentEmoji} *Sentiment:* ${(insights.sentiment || "neutral").toUpperCase()}\n\n`;

  // AI Summary
  message += `📝 *AI Summary:*\n${summary}\n\n`;

  // Auto-populated lead details (if available)
  if (extractedDetails) {
    const detailsSection = buildLeadDetailsSection(
      extractedDetails,
      isNewlyAutoPopulated || false,
    );
    if (detailsSection) {
      message += detailsSection + "\n\n";
    }
  }

  // Insights
  const insightsSection = buildInsightsSection(insights);
  if (insightsSection) {
    message += insightsSection + "\n\n";
  }

  // Score impact
  message += `🔥 *Conversion Score Impact:* ${scoreIndicator}\n\n`;

  // Links
  message += `🎧 [Listen to Recording](${driveUrl})\n`;
  if (leadId) {
    message += `📋 [View Lead](${APP_URL}/leads/${leadId})\n`;
  }

  // Prompt for more details if needed
  if (extractedDetails) {
    const missingFields: string[] = [];
    if (!extractedDetails.site_region) missingFields.push("Region");
    if (!extractedDetails.site_location) missingFields.push("Location");
    if (!extractedDetails.estimated_quantity) missingFields.push("Quantity");

    if (missingFields.length > 0) {
      message += `\n💬 _Need more details? Missing: ${missingFields.join(", ")}_\n`;
      message += `_Reply with updates to add manually._`;
    } else {
      message += `\n✅ _All key lead details captured!_`;
    }
  }

  // Send the notification
  const success = await sendMessage(chatId, message);

  if (success) {
    log("Notification sent", {
      chatId,
      leadName,
      phoneNumber,
      isNewlyAutoPopulated,
    });
  }

  return success;
}

/**
 * Send error notification (to admin only)
 */
export async function sendErrorNotification(
  recordingId: string,
  error: string,
): Promise<void> {
  const adminChatId =
    process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!adminChatId) return;

  const message =
    `🚨 *Call Recording Processing Failed*\n\n` +
    `📋 *Recording ID:* \`${recordingId}\`\n` +
    `❌ *Error:* ${error.slice(0, 200)}\n\n` +
    `Please check the worker logs for details.`;

  await sendMessage(adminChatId, message);
}

/**
 * Send processing started notification (optional, for long recordings)
 */
export async function sendProcessingStartedNotification(
  chatId: string,
  phoneNumber: string,
  filename: string,
): Promise<void> {
  const message =
    `⏳ *Processing Started*\n\n` +
    `📱 *Phone:* ${phoneNumber}\n` +
    `📁 *File:* ${filename}\n\n` +
    `Transcription and analysis in progress...`;

  await sendMessage(chatId, message);
}
