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

export interface NewLeadNotification {
  id: string;
  name: string;
  phone: string;
  source?: string;
  location?: string;
  requirements?: string;
  budget?: number;
  assignedStaff?: string;
}

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

/**
 * Enhanced new lead notification with full details
 */
export async function notifyNewLeadDetailed(
  lead: NewLeadNotification
): Promise<SendTelegramResult> {
  const {
    id,
    name,
    phone,
    source,
    location,
    requirements,
    budget,
    assignedStaff,
  } = lead;

  // Format budget in Indian Rupees
  const formatBudget = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const message = `🆕 *New Lead Added*

👤 *Name:* ${name}
📱 *Phone:* ${phone}
${source ? `📍 *Source:* ${source}` : ''}
${location ? `🏠 *Location:* ${location}` : ''}
${requirements ? `📋 *Requirements:*
${requirements.slice(0, 200)}${requirements.length > 200 ? '...' : ''}` : ''}
${budget ? `💰 *Budget:* ${formatBudget(budget)}` : ''}
${assignedStaff ? `👷 *Assigned to:* ${assignedStaff}` : ''}

⏰ *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

[View Lead Details](https://maiyuri-bricks-app.vercel.app/leads/${id})`;

  return sendTelegramMessage(message.trim());
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

/**
 * Comprehensive AI Analysis notification with full details
 */
export interface AIAnalysisNotification {
  leadId: string;
  leadName: string;
  phone?: string;
  source?: string;
  status?: string;
  summary?: string;
  score?: number;
  nextAction?: string;
  followUpDate?: string;
  factors?: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
  }>;
  suggestions?: Array<{
    type: string;
    content: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export async function notifyAIAnalysis(
  analysis: AIAnalysisNotification
): Promise<SendTelegramResult> {
  const {
    leadId,
    leadName,
    phone,
    source,
    status,
    summary,
    score,
    nextAction,
    followUpDate,
    factors,
    suggestions,
  } = analysis;

  // Score emoji based on value
  const getScoreEmoji = (s: number) => {
    if (s >= 0.8) return '🔥';
    if (s >= 0.6) return '🟢';
    if (s >= 0.4) return '🟡';
    return '🔴';
  };

  // Impact emoji
  const getImpactEmoji = (impact: string) => {
    if (impact === 'positive') return '✅';
    if (impact === 'negative') return '❌';
    return '➖';
  };

  // Priority emoji
  const getPriorityEmoji = (priority: string) => {
    if (priority === 'high') return '🔴';
    if (priority === 'medium') return '🟡';
    return '🟢';
  };

  // Build factors section
  let factorsSection = '';
  if (factors && factors.length > 0) {
    factorsSection = `
📊 *Key Factors:*
${factors.slice(0, 5).map(f => `${getImpactEmoji(f.impact)} ${f.factor}`).join('\n')}`;
  }

  // Build suggestions section
  let suggestionsSection = '';
  if (suggestions && suggestions.length > 0) {
    suggestionsSection = `
💡 *AI Suggestions:*
${suggestions.slice(0, 3).map(s => `${getPriorityEmoji(s.priority)} ${s.content.slice(0, 100)}${s.content.length > 100 ? '...' : ''}`).join('\n')}`;
  }

  const message = `🤖 *AI Lead Analysis Complete*

👤 *Lead:* ${leadName}
${phone ? `📱 *Phone:* ${phone}` : ''}
${source ? `📍 *Source:* ${source}` : ''}
${status ? `📋 *Status:* ${status.toUpperCase()}` : ''}

${score !== undefined ? `${getScoreEmoji(score)} *Conversion Score:* ${Math.round(score * 100)}%` : ''}

${summary ? `📝 *AI Summary:*
${summary.slice(0, 300)}${summary.length > 300 ? '...' : ''}` : ''}
${factorsSection}
${suggestionsSection}

${nextAction ? `🎯 *Next Best Action:*
${nextAction}` : ''}

${followUpDate ? `📅 *Suggested Follow-up:* ${followUpDate}` : ''}

[View Lead Details](https://maiyuri-bricks-app.vercel.app/leads/${leadId})`;

  return sendTelegramMessage(message.trim());
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
