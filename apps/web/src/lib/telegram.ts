/**
 * Telegram Notification Service
 * Sends notifications to configured Telegram chats for various events.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

// Lazy load config to avoid build-time issues
function getConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  };
}

export interface SendTelegramResult {
  success: boolean;
  error?: string;
}

/**
 * Send a raw message to Telegram
 */
export async function sendTelegramMessage(
  text: string,
  chatId?: string
): Promise<SendTelegramResult> {
  const config = getConfig();
  const targetChatId = chatId || config.chatId;

  if (!config.botToken) {
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN');
    return { success: false, error: 'Telegram not configured' };
  }

  if (!targetChatId) {
    console.warn('[Telegram] Missing chat ID');
    return { success: false, error: 'No chat ID provided' };
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[Telegram] API error:', data);
      return { success: false, error: data.description || 'Telegram API error' };
    }

    return { success: true };
  } catch (error) {
    console.error('[Telegram] Network error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Notification Templates
 */

export async function notifyNewLead(
  leadName: string,
  phone: string,
  source?: string
): Promise<SendTelegramResult> {
  const message = `🆕 *New Lead Added*

👤 *Name:* ${leadName}
📱 *Phone:* ${phone}
${source ? `📍 *Source:* ${source}` : ''}

[View in Dashboard](https://maiyuri-bricks-app.vercel.app/leads)`;

  return sendTelegramMessage(message);
}

export async function notifyLeadUpdated(
  leadName: string,
  updateType: string,
  details?: string
): Promise<SendTelegramResult> {
  const message = `📝 *Lead Updated*

👤 *Lead:* ${leadName}
🔄 *Update:* ${updateType}
${details ? `📄 *Details:* ${details}` : ''}`;

  return sendTelegramMessage(message);
}

export async function notifyStaffInvited(
  staffName: string,
  email: string,
  role: string
): Promise<SendTelegramResult> {
  const roleEmoji = role === 'founder' ? '👑' : role === 'accountant' ? '📊' : '🔧';
  const message = `📨 *Staff Invitation Sent*

${roleEmoji} *Name:* ${staffName}
📧 *Email:* ${email}
🏷️ *Role:* ${role.charAt(0).toUpperCase() + role.slice(1)}

Invitation valid for 7 days.`;

  return sendTelegramMessage(message);
}

export async function notifyStaffJoined(
  staffName: string,
  role: string
): Promise<SendTelegramResult> {
  const message = `✅ *New Team Member Joined*

👋 *Welcome:* ${staffName}
🏷️ *Role:* ${role.charAt(0).toUpperCase() + role.slice(1)}

They can now access the lead management system.`;

  return sendTelegramMessage(message);
}

export async function notifyFollowUpReminder(
  leadName: string,
  dueDate: string,
  assignedTo?: string
): Promise<SendTelegramResult> {
  const message = `⏰ *Follow-up Reminder*

👤 *Lead:* ${leadName}
📅 *Due:* ${dueDate}
${assignedTo ? `👷 *Assigned to:* ${assignedTo}` : ''}

Don't forget to follow up!`;

  return sendTelegramMessage(message);
}

export async function notifyDailySummary(
  stats: {
    newLeads: number;
    followUpsCompleted: number;
    pendingFollowUps: number;
    hotLeads: number;
  }
): Promise<SendTelegramResult> {
  const message = `📊 *Daily Summary*

🆕 New leads today: ${stats.newLeads}
✅ Follow-ups completed: ${stats.followUpsCompleted}
⏳ Pending follow-ups: ${stats.pendingFollowUps}
🔥 Hot leads: ${stats.hotLeads}

[View Dashboard](https://maiyuri-bricks-app.vercel.app/dashboard)`;

  return sendTelegramMessage(message);
}

export async function notifyAIInsight(
  leadName: string,
  insight: string
): Promise<SendTelegramResult> {
  const message = `🤖 *AI Insight*

👤 *Lead:* ${leadName}
💡 *Insight:* ${insight.slice(0, 200)}${insight.length > 200 ? '...' : ''}`;

  return sendTelegramMessage(message);
}

export async function notifyQuoteReceived(
  leadName: string,
  amount: string,
  source?: string
): Promise<SendTelegramResult> {
  const message = `💰 *Quote Received*

👤 *Lead:* ${leadName}
💵 *Amount:* ₹${amount}
${source ? `📍 *From:* ${source}` : ''}`;

  return sendTelegramMessage(message);
}

export async function notifyError(
  errorType: string,
  details: string
): Promise<SendTelegramResult> {
  const message = `🚨 *System Alert*

⚠️ *Error:* ${errorType}
📄 *Details:* ${details.slice(0, 300)}

Please investigate.`;

  return sendTelegramMessage(message);
}

/**
 * Test the Telegram connection
 */
export async function testTelegramConnection(): Promise<SendTelegramResult> {
  const message = `✅ *Telegram Connected*

Maiyuri Bricks Lead Management is now connected to this chat.

You will receive notifications for:
• New leads
• Follow-up reminders
• AI insights
• Daily summaries
• Staff updates`;

  return sendTelegramMessage(message);
}
