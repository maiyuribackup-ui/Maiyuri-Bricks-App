/**
 * Telegram Notification Service
 *
 * Sends rich call analysis notifications to Telegram.
 */

import { log, logError } from './logger.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://maiyuri-bricks-app.vercel.app';

// Types
interface CallInsights {
  complaints?: string[];
  negative_feedback?: string[];
  negotiation_signals?: string[];
  price_expectations?: string[];
  positive_signals?: string[];
  recommended_actions?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
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
}

/**
 * Send a message to Telegram
 */
async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    log('Telegram not configured, skipping notification');
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json() as { ok: boolean; description?: string };

    if (!data.ok) {
      logError('Telegram API error', data);
      return false;
    }

    return true;
  } catch (error) {
    logError('Telegram send failed', error);
    return false;
  }
}

/**
 * Format duration as mm:ss
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get sentiment emoji
 */
function getSentimentEmoji(sentiment?: string): string {
  switch (sentiment) {
    case 'positive':
      return '🟢';
    case 'negative':
      return '🔴';
    case 'mixed':
      return '🟡';
    default:
      return '⚪';
  }
}

/**
 * Get score impact indicator
 */
function getScoreImpactIndicator(impact: number): string {
  if (impact > 0.1) return `📈 +${Math.round(impact * 100)}%`;
  if (impact < -0.1) return `📉 ${Math.round(impact * 100)}%`;
  return '➡️ 0%';
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
    sections.push(`🔴 *Concerns:*\n${concerns.map((c) => `• ${c}`).join('\n')}`);
  }

  // Negotiation signals (yellow)
  const negotiation = [
    ...(insights.negotiation_signals || []),
    ...(insights.price_expectations || []),
  ].slice(0, 3);

  if (negotiation.length > 0) {
    sections.push(
      `🟡 *Negotiation Signals:*\n${negotiation.map((n) => `• ${n}`).join('\n')}`
    );
  }

  // Positive signals (green)
  if (insights.positive_signals && insights.positive_signals.length > 0) {
    sections.push(
      `🟢 *Positive Signals:*\n${insights.positive_signals
        .slice(0, 3)
        .map((p) => `• ${p}`)
        .join('\n')}`
    );
  }

  // Recommended actions (target)
  if (insights.recommended_actions && insights.recommended_actions.length > 0) {
    sections.push(
      `🎯 *Recommended Action:*\n${insights.recommended_actions
        .slice(0, 2)
        .map((a) => `• ${a}`)
        .join('\n')}`
    );
  }

  return sections.join('\n\n');
}

/**
 * Send call recording processed notification
 */
export async function sendTelegramNotification(
  chatId: string,
  data: NotificationData
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
  message += `${sentimentEmoji} *Sentiment:* ${(insights.sentiment || 'neutral').toUpperCase()}\n\n`;

  // AI Summary
  message += `📝 *AI Summary:*\n${summary}\n\n`;

  // Insights
  const insightsSection = buildInsightsSection(insights);
  if (insightsSection) {
    message += insightsSection + '\n\n';
  }

  // Score impact
  message += `🔥 *Conversion Score Impact:* ${scoreIndicator}\n\n`;

  // Links
  message += `🎧 [Listen to Recording](${driveUrl})\n`;
  if (leadId) {
    message += `📋 [View Lead](${APP_URL}/leads/${leadId})`;
  }

  // Send the notification
  const success = await sendMessage(chatId, message);

  if (success) {
    log('Notification sent', { chatId, leadName, phoneNumber });
  }

  return success;
}

/**
 * Send error notification (to admin only)
 */
export async function sendErrorNotification(
  recordingId: string,
  error: string
): Promise<void> {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!adminChatId) return;

  const message = `🚨 *Call Recording Processing Failed*\n\n` +
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
  filename: string
): Promise<void> {
  const message = `⏳ *Processing Started*\n\n` +
    `📱 *Phone:* ${phoneNumber}\n` +
    `📁 *File:* ${filename}\n\n` +
    `Transcription and analysis in progress...`;

  await sendMessage(chatId, message);
}
