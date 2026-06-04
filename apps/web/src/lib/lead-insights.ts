/**
 * Lead insights — deterministic, client-side sales intelligence.
 *
 * These helpers turn raw lead fields into the signals the Leads list surfaces:
 *  - aging / SLA staleness (red rail + "Nd idle" badge)
 *  - a one-line "next best action" recommendation per lead
 *  - a triage score that powers the "Call next" strip
 *
 * Deterministic on purpose: a 50-row list can't afford a per-row LLM call, and
 * these rules encode the same playbook the AI nudge prompts already use
 * (hot = follow up <24h, quote-shared-no-reply = nudge, etc.). No network, no
 * cost, instant.
 */
import type { Lead } from "@maiyuri/shared";

const DAY_MS = 86_400_000;

export function daysSince(dateStr?: string | null): number {
  if (!dateStr) return Infinity;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / DAY_MS);
}

const TERMINAL_STAGES = new Set(["order_won", "closed_lost"]);

// Days of inactivity (since updated_at) before a lead in a stage is "stale".
const STALE_THRESHOLD: Record<string, number> = {
  new_inquiry: 2,
  qualified_lead: 3,
  quote_shared: 4,
  factory_visit_proof: 5,
  decision_pending: 5,
  finalisation: 3,
};

export interface Aging {
  days: number;
  stale: boolean;
  label: string | null;
}

export function getAging(lead: Lead): Aging {
  if (TERMINAL_STAGES.has(lead.pipeline_stage)) {
    return { days: 0, stale: false, label: null };
  }
  const days = daysSince(lead.updated_at);
  let threshold = STALE_THRESHOLD[lead.pipeline_stage] ?? 7;
  // Hot leads decay faster — they expect a touch within ~2 days.
  if (lead.lead_temperature === "hot") threshold = Math.min(threshold, 2);
  const stale = Number.isFinite(days) && days >= threshold;
  return { days, stale, label: stale ? `${days}d idle` : null };
}

export type FollowUp = "overdue" | "today" | "upcoming" | null;

export function followUpStatus(lead: Lead): FollowUp {
  if (!lead.follow_up_date) return null;
  const d = new Date(lead.follow_up_date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  return "upcoming";
}

export type Urgency = "high" | "medium" | "low";

export interface NextAction {
  text: string;
  urgency: Urgency;
}

/**
 * The single most important thing to do for this lead right now.
 * Ordered by priority — first match wins.
 */
export function getNextAction(lead: Lead): NextAction | null {
  if (TERMINAL_STAGES.has(lead.pipeline_stage)) return null;

  const fu = followUpStatus(lead);
  const aging = getAging(lead);
  const updated = daysSince(lead.updated_at);
  const created = daysSince(lead.created_at);

  // 1. Overdue follow-up — nothing beats a promise you made to the customer.
  if (fu === "overdue") {
    return { text: "Follow-up overdue — call now", urgency: "high" };
  }

  // 2. Brand-new, not yet contacted.
  if (
    lead.lead_status === "new_contact_pending" ||
    (lead.pipeline_stage === "new_inquiry" && created <= 2 && updated >= 1)
  ) {
    return { text: "New lead — make first contact", urgency: "high" };
  }

  // 3. Quote shared, gone quiet.
  if (lead.pipeline_stage === "quote_shared" && updated >= 3) {
    return {
      text: `Quote sent ${updated}d ago, no reply — nudge`,
      urgency: "high",
    };
  }

  // 4. Hot lead going cold.
  if (lead.lead_temperature === "hot" && aging.stale) {
    return { text: `Hot lead idle ${aging.days}d — re-engage`, urgency: "high" };
  }

  // 5. Factory-visit stage but no visit lined up.
  if (
    lead.pipeline_stage === "factory_visit_proof" &&
    lead.factory_visit_status !== "scheduled" &&
    lead.factory_visit_status !== "visited"
  ) {
    return { text: "Invite to a factory visit", urgency: "medium" };
  }

  // 6. Finalisation — push to close.
  if (lead.pipeline_stage === "finalisation") {
    return { text: "Close it — confirm order & advance", urgency: "high" };
  }

  // 7. Decision pending, gone quiet.
  if (lead.pipeline_stage === "decision_pending" && updated >= 4) {
    return { text: "Decision pending — check in", urgency: "medium" };
  }

  // 8. Follow-up scheduled for today.
  if (fu === "today") {
    return { text: "Follow-up due today", urgency: "medium" };
  }

  // 9. Generic decay.
  if (aging.stale) {
    return { text: `No activity ${aging.days}d — follow up`, urgency: "medium" };
  }

  return null;
}

/**
 * Urgency score for the "Call next" strip. Higher = call sooner.
 * Terminal leads score below zero so they never surface.
 */
export function triageScore(lead: Lead): number {
  if (TERMINAL_STAGES.has(lead.pipeline_stage)) return -1;

  let score = 0;
  const fu = followUpStatus(lead);
  if (fu === "overdue") score += 100;
  else if (fu === "today") score += 60;

  if (lead.lead_temperature === "hot") score += 40;
  else if (lead.lead_temperature === "warm") score += 15;

  const aging = getAging(lead);
  if (aging.stale) score += Math.min(aging.days, 30);

  if (typeof lead.ai_score === "number") score += lead.ai_score * 20;

  // New uncontacted leads deserve a prompt first touch.
  if (lead.lead_status === "new_contact_pending") score += 35;

  return score;
}

export const URGENCY_STYLES: Record<Urgency, string> = {
  high: "text-red-600 dark:text-red-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-slate-500 dark:text-slate-400",
};
