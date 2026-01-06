/**
 * Telegram Notification Service
 * Sends alerts to a configured Telegram chat.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

// Singleton config (can be updated via environment variables)
let config: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
};

export async function sendMessage(text: string): Promise<boolean> {
  // If not configured, just log to console (mock mode)
  if (!config.botToken || !config.chatId) {
    console.log('[Telegram Mock] Would send:', text);
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return true; // Pretend success
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json() as any;

    if (!data.ok) {
        console.error('[Telegram] Error sending message:', data);
        return false;
    }

    return true;
  } catch (error) {
    console.error('[Telegram] Network error:', error);
    return false;
  }
}

export async function notifyNewQuestion(question: string, context?: string): Promise<boolean> {
  const message = `🚨 *Knowledge Gap Detected*\n\n*Question:* ${question}\n\n*Context:* ${context ? context.slice(0, 100) + '...' : 'N/A'}`;
  return sendMessage(message);
}

export default {
  sendMessage,
  notifyNewQuestion,
};
