/**
 * Operations Control — labour summarisation and settlement rules (PRD
 * §57–§68), pure functions.
 *
 * Generation lives in SQL, because it must be atomic with posting production
 * and completing a delivery. What lives here is everything the SCREEN needs
 * to decide: how a week's entries roll up, whether a status change is legal,
 * and which work could not be priced.
 *
 * THE SCOPE BOUNDARY, stated once so it is not quietly crossed: V1 ends at
 * ACTIVITY TOTALS — Production Rs.X, Loading Rs.Y, Unloading Rs.Z, weekly
 * payable Rs.Total. There is no worker dimension anywhere in this module, and
 * adding one is a business decision (open question 8), not a refactor.
 */

import { factoryWeekStart, factoryWeekEnd } from "@/lib/factory";

export interface LedgerEntry {
  id: string;
  entry_date: string;
  week_start: string;
  activity_code: string;
  finished_good_id: string;
  product_name?: string | null;
  source_type: string;
  eligible_qty: number;
  rate_applied: number;
  amount: number;
  settlement_id: string | null;
}

export type SettlementStatus =
  | "draft"
  | "reviewed"
  | "approved"
  | "paid"
  | "locked";

/** The ladder, in order. Index is the only thing the transition rule needs. */
const LADDER: SettlementStatus[] = [
  "draft",
  "reviewed",
  "approved",
  "paid",
  "locked",
];

/**
 * Is this settlement status change allowed?
 *
 * Forward is always allowed, including skipping a rung — a business that pays
 * on approval without a separate "paid" step should not be forced through it.
 *
 * Backward is allowed ONLY between draft and reviewed. Once a week is
 * approved, money has been committed against it, and the correction path is a
 * differential in the current week (§67) rather than an unapproval. Locked is
 * terminal: reopening a settled week is deliberately out of scope for V1, and
 * the database enforces the same rule independently.
 */
export function canTransition(
  from: SettlementStatus,
  to: SettlementStatus,
): boolean {
  if (from === to) return true;
  if (from === "locked") return false;
  const fromIdx = LADDER.indexOf(from);
  const toIdx = LADDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  if (toIdx > fromIdx) return true;
  // backward: only within the un-approved rungs
  return fromIdx <= 1 && toIdx <= 1;
}

export interface ActivityTotal {
  activity_code: string;
  quantity: number;
  amount: number;
  entries: number;
}

export interface WeekSummary {
  week_start: string;
  week_end: string;
  by_activity: ActivityTotal[];
  /** rolls up every activity — the number that gets paid */
  total: number;
  entry_count: number;
  /** entries whose amount is negative: corrections to previously paid work */
  differential_count: number;
  differential_total: number;
}

/**
 * Roll a week's entries up by activity.
 *
 * Differentials are counted separately as well as included in the total,
 * because "Rs.11,900 payable" and "Rs.11,900 payable, of which Rs.−700 is a
 * correction to a week already paid" are answers to different questions, and
 * the second is the one that gets queried at the settlement meeting.
 */
export function summariseWeek(
  weekStart: string,
  entries: readonly LedgerEntry[],
): WeekSummary {
  const byActivity = new Map<string, ActivityTotal>();
  let total = 0;
  let differentialCount = 0;
  let differentialTotal = 0;

  for (const e of entries) {
    const row = byActivity.get(e.activity_code) ?? {
      activity_code: e.activity_code,
      quantity: 0,
      amount: 0,
      entries: 0,
    };
    row.quantity += Number(e.eligible_qty);
    row.amount += Number(e.amount);
    row.entries += 1;
    byActivity.set(e.activity_code, row);

    total += Number(e.amount);
    if (Number(e.amount) < 0) {
      differentialCount += 1;
      differentialTotal += Number(e.amount);
    }
  }

  return {
    week_start: weekStart,
    week_end: factoryWeekEnd(weekStart),
    by_activity: [...byActivity.values()].sort((a, b) =>
      a.activity_code.localeCompare(b.activity_code),
    ),
    total,
    entry_count: entries.length,
    differential_count: differentialCount,
    differential_total: differentialTotal,
  };
}

/** The Sat–Fri week containing a date, as the pair the screen needs. */
export function weekRange(isoDate: string): { start: string; end: string } {
  const start = factoryWeekStart(isoDate);
  return { start, end: factoryWeekEnd(start) };
}

/**
 * The N most recent factory weeks, newest first — the week picker's options.
 */
export function recentWeeks(fromIso: string, count: number): string[] {
  const weeks: string[] = [];
  let cursor = factoryWeekStart(fromIso);
  for (let i = 0; i < Math.max(0, count); i += 1) {
    weeks.push(cursor);
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    cursor = d.toISOString().slice(0, 10);
  }
  return weeks;
}

export interface UnpricedWork {
  source_type: string;
  source_id: string;
  activity_code: string;
  finished_good_id: string;
  product_name: string | null;
  entry_date: string;
  quantity: number;
}

/**
 * Work that happened but could not be priced, because no rate is configured
 * for that product and activity on that date.
 *
 * This is reported rather than hidden, and it is NOT an error state: the rate
 * masters ship empty by design (§100), so on day one everything is unpriced.
 * What matters is that the work is visible and recoverable — entering the
 * rate and re-running generation prices it retrospectively, at the rate in
 * force on the day the work happened, not today's.
 */
export function summariseUnpriced(rows: readonly UnpricedWork[]): {
  count: number;
  quantity: number;
  byActivity: { activity_code: string; count: number; quantity: number }[];
} {
  const byActivity = new Map<string, { activity_code: string; count: number; quantity: number }>();
  let quantity = 0;
  for (const r of rows) {
    const row = byActivity.get(r.activity_code) ?? {
      activity_code: r.activity_code,
      count: 0,
      quantity: 0,
    };
    row.count += 1;
    row.quantity += Number(r.quantity);
    byActivity.set(r.activity_code, row);
    quantity += Number(r.quantity);
  }
  return {
    count: rows.length,
    quantity,
    byActivity: [...byActivity.values()].sort((a, b) =>
      a.activity_code.localeCompare(b.activity_code),
    ),
  };
}
