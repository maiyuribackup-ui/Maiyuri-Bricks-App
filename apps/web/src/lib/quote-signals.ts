/**
 * Quotes Inbox signals — turning engagement telemetry into "what do I do about
 * this one, today".
 *
 * The inbox previously showed raw counts (opened 4×, 12 section views). Counts
 * describe; they do not instruct. Each quote now carries exactly one signal
 * naming the next action, and the list sorts by how urgent that action is.
 *
 * Note on view counts: until Aug 2026 one customer open logged two view events
 * (server render + client mount), so counts on older quotes read roughly double
 * the truth. The REPEAT_THRESHOLD below applies to corrected counts.
 */

/** Opens with no CTA click that mean "interested but hesitating". */
export const REPEAT_THRESHOLD = 3;
/** How long a quote may sit unopened before it needs chasing. */
export const UNOPENED_HOURS = 24;

export type QuoteSignalKey =
  | "cta_clicked"
  | "repeat_no_cta"
  | "unopened_24h"
  | "opened"
  | "just_sent";

export type QuoteSignalTone = "urgent" | "warm" | "chase" | "neutral";

export interface QuoteSignal {
  key: QuoteSignalKey;
  /** Chip text — states the situation. */
  label: string;
  /** What the rep should actually do. */
  action: string;
  tone: QuoteSignalTone;
  /** Higher sorts first. */
  rank: number;
}

export interface QuoteEngagement {
  createdAt: string;
  viewCount: number;
  ctaClicked: boolean;
  lastViewedAt?: string | null;
}

function hoursSince(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / 3_600_000;
}

/**
 * The one signal that matters for this quote right now.
 * Ordered most urgent first — the first match wins.
 */
export function getQuoteSignal(
  q: QuoteEngagement,
  now: Date = new Date(),
): QuoteSignal {
  // Strongest buying signal there is: they asked to be contacted.
  if (q.ctaClicked) {
    return {
      key: "cta_clicked",
      label: "Clicked CTA",
      action: "Call now",
      tone: "urgent",
      rank: 4,
    };
  }

  // Back repeatedly but never acted — usually price or a specific doubt.
  if (q.viewCount >= REPEAT_THRESHOLD) {
    return {
      key: "repeat_no_cta",
      label: `Opened ${q.viewCount}×, no action`,
      action: "Call and ask what's holding them",
      tone: "warm",
      rank: 3,
    };
  }

  const ageHours = hoursSince(q.createdAt, now);

  // Sent and ignored — the quote may not have reached them at all.
  if (q.viewCount === 0 && ageHours >= UNOPENED_HOURS) {
    const days = Math.floor(ageHours / 24);
    return {
      key: "unopened_24h",
      label: days >= 1 ? `Not opened in ${days}d` : "Not opened in 24h",
      action: "Resend on WhatsApp",
      tone: "chase",
      rank: 2,
    };
  }

  if (q.viewCount > 0) {
    return {
      key: "opened",
      label: q.viewCount > 1 ? `Opened ${q.viewCount}×` : "Opened",
      action: "Follow up",
      tone: "neutral",
      rank: 1,
    };
  }

  return {
    key: "just_sent",
    label: "Just sent",
    action: "Give it a day",
    tone: "neutral",
    rank: 0,
  };
}

/** Signals that belong in the "do something today" bucket. */
export function needsActionToday(signal: QuoteSignal): boolean {
  return signal.rank >= 2;
}

/**
 * A follow-up date is overdue when it is before today. Compared date-only, so
 * a follow-up set for today is not flagged mid-morning.
 */
export function isFollowUpOverdue(
  followUpDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!followUpDate) return false;
  const due = new Date(followUpDate);
  if (Number.isNaN(due.getTime())) return false;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDay.getTime() < today.getTime();
}
