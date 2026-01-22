/**
 * AI Nudging System Utilities
 *
 * Message formatting, rule matching, and digest generation for automated
 * lead follow-up reminders via Telegram.
 */

import type {
  Lead,
  LeadStatus,
  NudgeRule,
  NudgeRuleConditions,
  NudgeDigestLead,
  NudgeDigestGroup,
} from "@maiyuri/shared";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

/**
 * Status emoji mapping
 */
const STATUS_EMOJI: Record<LeadStatus, string> = {
  new: "🆕",
  follow_up: "⏰",
  hot: "🔥",
  cold: "❄️",
  converted: "✅",
  lost: "❌",
};

/**
 * Format days overdue as human-readable string
 */
export function formatDaysOverdue(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 0) return `In ${Math.abs(days)} days`;
  return `${days} days ago`;
}

/**
 * Format lead score as percentage
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "N/A";
  return `${Math.round(score * 100)}%`;
}

/**
 * Calculate days since a date
 */
export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days until a date (negative if overdue)
 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  // Reset time to start of day for accurate day calculation
  date.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - now.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a lead matches a nudge rule's conditions
 */
export function matchesRule(lead: Lead, rule: NudgeRule): boolean {
  const conditions = rule.conditions;

  // Check statuses filter
  if (conditions.statuses && conditions.statuses.length > 0) {
    if (!conditions.statuses.includes(lead.status)) {
      return false;
    }
  }

  // Check classifications filter
  if (conditions.classifications && conditions.classifications.length > 0) {
    if (
      !lead.classification ||
      !conditions.classifications.includes(lead.classification)
    ) {
      return false;
    }
  }

  // Check lead_types filter
  if (conditions.lead_types && conditions.lead_types.length > 0) {
    if (!lead.lead_type || !conditions.lead_types.includes(lead.lead_type)) {
      return false;
    }
  }

  // Check score range
  if (conditions.min_score !== undefined && conditions.min_score !== null) {
    const score = lead.ai_score ?? 0;
    if (score < conditions.min_score) {
      return false;
    }
  }

  if (conditions.max_score !== undefined && conditions.max_score !== null) {
    const score = lead.ai_score ?? 0;
    if (score > conditions.max_score) {
      return false;
    }
  }

  // Check rule-type specific conditions
  switch (rule.rule_type) {
    case "follow_up_overdue": {
      const daysOverdue = conditions.days_overdue ?? 1;
      const followUpDays = daysUntil(lead.follow_up_date);
      // followUpDays is negative when overdue
      if (followUpDays === null || followUpDays > -daysOverdue) {
        return false;
      }
      break;
    }

    case "no_activity": {
      const daysSinceCreated = conditions.days_since_created ?? 2;
      const createdDays = daysSince(lead.created_at);
      if (createdDays === null || createdDays < daysSinceCreated) {
        return false;
      }
      // Also check no follow-up date set
      if (lead.follow_up_date) {
        return false;
      }
      break;
    }

    case "high_score_idle": {
      const daysIdle = conditions.days_idle ?? 3;
      const updatedDays = daysSince(lead.updated_at);
      if (updatedDays === null || updatedDays < daysIdle) {
        return false;
      }
      break;
    }

    case "custom":
      // Custom rules can have any combination of conditions
      // All filters above are already applied
      break;
  }

  return true;
}

/**
 * Convert a lead to a digest lead with rule info
 */
export function toDigestLead(lead: Lead, rule: NudgeRule): NudgeDigestLead {
  const followUpDays = daysUntil(lead.follow_up_date);

  return {
    id: lead.id,
    name: lead.name,
    contact: lead.contact,
    status: lead.status,
    ai_score: lead.ai_score ?? null,
    follow_up_date: lead.follow_up_date ?? null,
    next_action: lead.next_action ?? null,
    days_overdue:
      followUpDays !== null && followUpDays < 0
        ? Math.abs(followUpDays)
        : undefined,
    last_activity: lead.updated_at,
    rule_matched: rule.name,
  };
}

/**
 * Format a single lead entry for the digest message
 */
function formatDigestLeadEntry(lead: NudgeDigestLead, index: number): string {
  const emoji = STATUS_EMOJI[lead.status] || "📌";
  const lines: string[] = [];

  // Header line with status and name
  lines.push(
    `${emoji} *${(lead?.status ?? "unknown").toUpperCase()}:* ${lead.name}`,
  );

  // Phone number
  lines.push(`   📱 ${lead.contact}`);

  // Follow-up info
  if (lead.days_overdue) {
    lines.push(
      `   📅 Follow-up overdue by ${lead.days_overdue} day${lead.days_overdue > 1 ? "s" : ""}`,
    );
  } else if (lead.follow_up_date) {
    const days = daysUntil(lead.follow_up_date);
    if (days !== null) {
      lines.push(`   📅 Follow-up: ${formatDaysOverdue(-days)}`);
    }
  } else {
    lines.push(`   📅 No follow-up scheduled`);
  }

  // Score if available
  if (lead.ai_score !== null && lead.ai_score !== undefined) {
    const scoreEmoji =
      lead.ai_score >= 0.7 ? "🔥" : lead.ai_score >= 0.4 ? "🟡" : "⚪";
    lines.push(`   ${scoreEmoji} Score: ${formatScore(lead.ai_score)}`);
  }

  // Next action if available
  if (lead.next_action) {
    lines.push(
      `   💡 ${lead.next_action.slice(0, 50)}${lead.next_action.length > 50 ? "..." : ""}`,
    );
  }

  return lines.join("\n");
}

/**
 * Format the morning digest message for a staff member
 */
export function formatDigestMessage(group: NudgeDigestGroup): string {
  const { staff_name, leads } = group;

  const lines: string[] = [];

  // Header
  lines.push(`📋 *Morning Lead Digest*`);
  lines.push(``);

  // Staff greeting
  if (staff_name && staff_name !== "Unassigned") {
    lines.push(`Hi ${(staff_name ?? "User").split(" ")[0] || "User"},`);
  }
  lines.push(
    `You have *${leads.length}* lead${leads.length > 1 ? "s" : ""} requiring attention:`,
  );
  lines.push(``);

  // Group leads by status for better readability
  const statusOrder: LeadStatus[] = ["hot", "follow_up", "new", "cold"];
  const sortedLeads = [...leads].sort((a, b) => {
    const aIndex = statusOrder.indexOf(a.status);
    const bIndex = statusOrder.indexOf(b.status);
    return aIndex - bIndex;
  });

  // Format each lead (max 10 to keep message reasonable)
  const displayLeads = sortedLeads.slice(0, 10);
  displayLeads.forEach((lead, index) => {
    lines.push(formatDigestLeadEntry(lead, index));
    if (index < displayLeads.length - 1) {
      lines.push(``); // Blank line between leads
    }
  });

  // Note if there are more leads
  if (leads.length > 10) {
    lines.push(``);
    lines.push(`...and ${leads.length - 10} more leads`);
  }

  // Footer with link
  lines.push(``);
  lines.push(`[View All Leads](${APP_URL}/leads)`);

  return lines.join("\n");
}

/**
 * Format a manual nudge message for a single lead
 */
export function formatManualNudgeMessage(
  lead: Lead,
  nudgeType: string,
  customMessage?: string,
): string {
  const emoji = STATUS_EMOJI[lead.status] || "📌";
  const lines: string[] = [];

  lines.push(`⚡ *Lead Nudge*`);
  lines.push(``);
  lines.push(`${emoji} *Lead:* ${lead.name}`);
  lines.push(`📱 *Phone:* ${lead.contact}`);
  lines.push(`📋 *Status:* ${(lead?.status ?? "unknown").toUpperCase()}`);

  if (lead.ai_score !== null && lead.ai_score !== undefined) {
    lines.push(`🎯 *Score:* ${formatScore(lead.ai_score)}`);
  }

  if (lead.follow_up_date) {
    const days = daysUntil(lead.follow_up_date);
    if (days !== null && days < 0) {
      lines.push(
        `⏰ *Overdue:* ${Math.abs(days)} day${Math.abs(days) > 1 ? "s" : ""}`,
      );
    }
  }

  lines.push(``);

  if (customMessage) {
    lines.push(`💬 *Message:*`);
    lines.push(customMessage);
    lines.push(``);
  }

  if (lead.next_action) {
    lines.push(`🎯 *Suggested Action:*`);
    lines.push(lead.next_action);
    lines.push(``);
  }

  lines.push(`[View Lead Details](${APP_URL}/leads/${lead.id})`);

  return lines.join("\n");
}

/**
 * Generate a summary of nudges sent
 */
export function formatNudgeSummary(
  groupsProcessed: number,
  nudgesSent: number,
  errors: string[],
): string {
  const lines: string[] = [];

  lines.push(`📊 *Nudge Digest Summary*`);
  lines.push(``);
  lines.push(`👥 Staff notified: ${groupsProcessed}`);
  lines.push(`📬 Leads nudged: ${nudgesSent}`);

  if (errors.length > 0) {
    lines.push(`⚠️ Errors: ${errors.length}`);
    lines.push(``);
    lines.push(`*Error Details:*`);
    errors.slice(0, 3).forEach((error) => {
      lines.push(`• ${error.slice(0, 100)}`);
    });
    if (errors.length > 3) {
      lines.push(`...and ${errors.length - 3} more`);
    }
  } else {
    lines.push(`✅ No errors`);
  }

  return lines.join("\n");
}

/**
 * Check if a nudge was already sent today for a lead/rule combination
 */
export function getNudgeCheckKey(leadId: string, ruleId: string): string {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `${leadId}:${ruleId}:${today}`;
}
