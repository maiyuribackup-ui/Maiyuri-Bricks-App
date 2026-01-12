/**
 * Notification Agent
 * Handles scheduled alerts and notifications for leads and tasks
 */

import {
  anthropic,
  DEFAULT_MODEL,
  successResult,
  errorResult,
  parseJsonResponse,
  daysSince,
} from '../utils';
import type { AgentResult, ScoringInput } from '../types';

// Notification Types
export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'telegram';
export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low';
export type NotificationType =
  | 'follow_up_reminder'
  | 'lead_status_change'
  | 'hot_lead_alert'
  | 'conversion_opportunity'
  | 'overdue_task'
  | 'daily_digest'
  | 'weekly_summary';

export interface NotificationInput {
  type: NotificationType;
  leads?: ScoringInput['lead'][];
  notes?: ScoringInput['notes'];
  staffId?: string;
  customMessage?: string;
}

export interface NotificationOutput {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  channels: NotificationChannel[];
  recipients?: string[];
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationBatch {
  notifications: NotificationOutput[];
  summary: string;
  totalCount: number;
}

const SYSTEM_PROMPT = `You are an AI assistant that creates targeted notifications for a brick manufacturing sales team.

Your role is to:
1. Analyze lead and task data to determine notification needs
2. Create clear, actionable notification messages
3. Prioritize notifications based on urgency
4. Suggest appropriate delivery channels

Notification Guidelines:
- Keep messages concise (under 160 chars for SMS)
- Include specific lead names and action items
- Use urgency appropriately (not everything is urgent)
- Personalize when possible

Output Format:
Always respond with a JSON object:
{
  "priority": "high",
  "title": "Hot Lead Alert",
  "message": "Kumar from Chennai is ready to place an order. Call now!",
  "channels": ["push", "telegram"],
  "actionUrl": "/leads/123"
}`;

/**
 * Generate a notification for a specific event
 */
export async function createNotification(
  input: NotificationInput
): Promise<AgentResult<NotificationOutput>> {
  try {
    const { type, leads = [], notes = [], customMessage } = input;

    // Build context
    const contextData = buildNotificationContext(type, leads, notes);

    const userPrompt = `Create a ${type.replace(/_/g, ' ')} notification.

CONTEXT:
${contextData}

${customMessage ? `CUSTOM MESSAGE: ${customMessage}` : ''}

Generate an appropriate notification with priority, message, and channels.
Respond ONLY with the JSON object, no other text.`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const parsed = parseJsonResponse<Partial<NotificationOutput>>(responseText);

    if (!parsed) {
      // Fallback to basic notification
      return successResult(createBasicNotification(type, leads));
    }

    const notification: NotificationOutput = {
      id: generateNotificationId(),
      type,
      priority: parsed.priority || 'normal',
      title: parsed.title || getDefaultTitle(type),
      message: parsed.message || 'You have a new notification.',
      channels: parsed.channels || ['in_app'],
      recipients: input.staffId ? [input.staffId] : undefined,
      metadata: { leadCount: leads.length },
    };

    return successResult(notification, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Notification creation error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Notification creation failed'
    );
  }
}

/**
 * Check for due notifications and generate batch
 */
export function checkDueNotifications(
  leads: ScoringInput['lead'][],
  notes: ScoringInput['notes']
): NotificationBatch {
  const notifications: NotificationOutput[] = [];

  // Check for overdue follow-ups
  const overdueLeads = leads.filter((lead) => {
    if (!lead.follow_up_date) return false;
    return daysSince(lead.follow_up_date) > 0;
  });

  overdueLeads.forEach((lead) => {
    notifications.push({
      id: generateNotificationId(),
      type: 'overdue_task',
      priority: 'high',
      title: 'Overdue Follow-up',
      message: `Follow-up with ${lead.name} is ${Math.abs(daysSince(lead.follow_up_date!))} days overdue.`,
      channels: ['push', 'in_app'],
      recipients: lead.assigned_staff ? [lead.assigned_staff] : undefined,
      metadata: { leadId: lead.id, leadName: lead.name },
    });
  });

  // Check for hot leads
  const hotLeads = leads.filter((lead) => lead.status === 'hot');
  if (hotLeads.length > 0) {
    notifications.push({
      id: generateNotificationId(),
      type: 'hot_lead_alert',
      priority: 'urgent',
      title: 'Hot Leads Requiring Action',
      message: `${hotLeads.length} hot lead(s) need immediate attention.`,
      channels: ['push', 'telegram'],
      metadata: { leadIds: hotLeads.map((l) => l.id) },
    });
  }

  // Check for conversion opportunities (high AI score leads)
  const highScoreLeads = leads.filter(
    (lead) => lead.ai_score && lead.ai_score >= 0.8 && lead.status !== 'converted'
  );
  highScoreLeads.forEach((lead) => {
    notifications.push({
      id: generateNotificationId(),
      type: 'conversion_opportunity',
      priority: 'high',
      title: 'Conversion Opportunity',
      message: `${lead.name} has ${Math.round(lead.ai_score! * 100)}% conversion probability.`,
      channels: ['in_app'],
      recipients: lead.assigned_staff ? [lead.assigned_staff] : undefined,
      metadata: { leadId: lead.id, score: lead.ai_score },
    });
  });

  // Check for follow-ups due today
  const dueTodayLeads = leads.filter((lead) => {
    if (!lead.follow_up_date) return false;
    return daysSince(lead.follow_up_date) === 0;
  });

  dueTodayLeads.forEach((lead) => {
    notifications.push({
      id: generateNotificationId(),
      type: 'follow_up_reminder',
      priority: 'normal',
      title: 'Follow-up Due Today',
      message: `Scheduled follow-up with ${lead.name} is due today.`,
      channels: ['in_app'],
      recipients: lead.assigned_staff ? [lead.assigned_staff] : undefined,
      metadata: { leadId: lead.id },
    });
  });

  return {
    notifications,
    summary: `${notifications.length} notification(s) generated: ${overdueLeads.length} overdue, ${hotLeads.length} hot leads, ${highScoreLeads.length} conversion opportunities.`,
    totalCount: notifications.length,
  };
}

/**
 * Generate daily digest notification
 */
export function generateDailyDigest(
  leads: ScoringInput['lead'][],
  notes: ScoringInput['notes'],
  staffId?: string
): NotificationOutput {
  const staffLeads = staffId ? leads.filter((l) => l.assigned_staff === staffId) : leads;
  const todayNotes = notes.filter((n) => daysSince(n.created_at) === 0);

  const hotCount = staffLeads.filter((l) => l.status === 'hot').length;
  const newCount = staffLeads.filter((l) => l.status === 'new').length;
  const followUpCount = staffLeads.filter(
    (l) => l.follow_up_date && daysSince(l.follow_up_date) <= 0
  ).length;

  const message = [
    `Today: ${todayNotes.length} interaction(s).`,
    `${hotCount} hot lead(s).`,
    `${newCount} new lead(s).`,
    `${followUpCount} follow-up(s) scheduled.`,
  ].join(' ');

  return {
    id: generateNotificationId(),
    type: 'daily_digest',
    priority: hotCount > 0 ? 'high' : 'normal',
    title: 'Daily Lead Digest',
    message,
    channels: ['email', 'in_app'],
    recipients: staffId ? [staffId] : undefined,
    scheduledAt: new Date().toISOString(),
    metadata: {
      totalLeads: staffLeads.length,
      hotLeads: hotCount,
      newLeads: newCount,
      scheduledFollowUps: followUpCount,
      todayInteractions: todayNotes.length,
    },
  };
}

/**
 * Generate weekly summary notification
 */
export function generateWeeklySummary(
  leads: ScoringInput['lead'][],
  notes: ScoringInput['notes'],
  staffId?: string
): NotificationOutput {
  const staffLeads = staffId ? leads.filter((l) => l.assigned_staff === staffId) : leads;
  const weekNotes = notes.filter((n) => daysSince(n.created_at) <= 7);

  const converted = staffLeads.filter((l) => l.status === 'converted').length;
  const lost = staffLeads.filter((l) => l.status === 'lost').length;
  const conversionRate = staffLeads.length > 0
    ? Math.round((converted / staffLeads.length) * 100)
    : 0;

  const message = `This week: ${weekNotes.length} interactions, ${converted} conversions, ${lost} lost. Conversion rate: ${conversionRate}%.`;

  return {
    id: generateNotificationId(),
    type: 'weekly_summary',
    priority: 'normal',
    title: 'Weekly Performance Summary',
    message,
    channels: ['email'],
    recipients: staffId ? [staffId] : undefined,
    scheduledAt: new Date().toISOString(),
    metadata: {
      totalLeads: staffLeads.length,
      converted,
      lost,
      conversionRate,
      weeklyInteractions: weekNotes.length,
    },
  };
}

// Helper Functions

function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function buildNotificationContext(
  type: NotificationType,
  leads: ScoringInput['lead'][],
  notes: ScoringInput['notes']
): string {
  switch (type) {
    case 'follow_up_reminder':
      return leads
        .filter((l) => l.follow_up_date)
        .slice(0, 5)
        .map((l) => `${l.name} - Follow-up: ${l.follow_up_date}`)
        .join('\n');

    case 'hot_lead_alert':
      return leads
        .filter((l) => l.status === 'hot')
        .slice(0, 5)
        .map((l) => `${l.name} - ${l.contact} - Score: ${l.ai_score || 'N/A'}`)
        .join('\n');

    case 'daily_digest':
    case 'weekly_summary':
      return `Total Leads: ${leads.length}
Hot: ${leads.filter((l) => l.status === 'hot').length}
New: ${leads.filter((l) => l.status === 'new').length}
Converted: ${leads.filter((l) => l.status === 'converted').length}
Recent Notes: ${notes.slice(0, 5).length}`;

    default:
      return `${leads.length} lead(s), ${notes.length} note(s)`;
  }
}

function createBasicNotification(
  type: NotificationType,
  leads: ScoringInput['lead'][]
): NotificationOutput {
  return {
    id: generateNotificationId(),
    type,
    priority: 'normal',
    title: getDefaultTitle(type),
    message: `You have ${leads.length} lead(s) requiring attention.`,
    channels: ['in_app'],
    metadata: { leadCount: leads.length },
  };
}

function getDefaultTitle(type: NotificationType): string {
  const titles: Record<NotificationType, string> = {
    follow_up_reminder: 'Follow-up Reminder',
    lead_status_change: 'Lead Status Update',
    hot_lead_alert: 'Hot Lead Alert',
    conversion_opportunity: 'Conversion Opportunity',
    overdue_task: 'Overdue Task',
    daily_digest: 'Daily Digest',
    weekly_summary: 'Weekly Summary',
  };
  return titles[type] || 'Notification';
}

export default {
  createNotification,
  checkDueNotifications,
  generateDailyDigest,
  generateWeeklySummary,
};
