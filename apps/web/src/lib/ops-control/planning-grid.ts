/**
 * Operations Control — week-grid planning calculations (PRD §10, §12, §20-26),
 * pure functions.
 *
 * THE QUESTION THIS MODULE EXISTS TO ANSWER: for every delivery we have
 * promised a customer, is there a production plan that can actually meet it?
 *
 * A spreadsheet cannot answer that, and neither can a grid you merely type
 * into. Two facts have to be combined, and they live a week apart:
 *
 *  1. A confirmed delivery on Friday the 18th is a COMMITMENT.
 *  2. Bricks made today cannot ship for `curing_days` (7, factory-wide).
 *
 * So the bricks for Friday the 18th had to be produced by Friday the 11th —
 * which is very likely a week the planner has already scrolled past. That
 * gap between "promised" and "too late to make" is exactly where a customer
 * commitment gets missed, and it is invisible in a day-at-a-time screen.
 *
 * Everything here is date-string arithmetic, never Date objects in local
 * time: an IST-local Date is the previous day in UTC, which would silently
 * shift both the Sat-Fri week boundary and the curing walk-back by a day.
 */

import { factoryWeekStart, factoryWeekEnd, parseISODate, toISODate } from "@/lib/factory";

/** Add days to a 'YYYY-MM-DD' string, staying in date-only space. */
export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** The seven dates of the factory week containing `anyDate`, Saturday first. */
export function weekDays(anyDate: string): string[] {
  const start = factoryWeekStart(anyDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface WeekRange {
  start: string;
  end: string;
  days: string[];
}

export function weekRangeOf(anyDate: string): WeekRange {
  const start = factoryWeekStart(anyDate);
  return { start, end: factoryWeekEnd(start), days: weekDays(start) };
}

/**
 * The last date production can START and still cure in time to ship on
 * `deliveryDate`. Produce on this date and the stock becomes dispatchable
 * exactly on the delivery date; produce a day later and it does not.
 */
export function latestProductionDate(
  deliveryDate: string,
  curingDays: number,
): string {
  return addDays(deliveryDate, -Math.max(0, curingDays));
}

export type CommitmentRisk =
  | "ready"          // enough dispatch-eligible stock is already reserved
  | "curing_in_time" // reserved, still curing, but ready on or before the date
  | "planned"        // not yet made, but planned early enough to cure in time
  | "at_risk"        // production is planned, but too late to cure in time
  | "uncovered";     // nothing reserved and nothing planned

export interface CommitmentInput {
  deliveryDate: string;
  quantity: number;
  curingDays: number;
  /** reserved for this SO line and dispatchable TODAY — bricks in the yard */
  readyNow: number;
  /** reserved and dispatchable on or before the delivery date (>= readyNow) */
  readyByDate: number;
  /** reserved, but curing until AFTER the delivery date */
  curingLate: number;
  /** planned production early enough to cure by the delivery date */
  plannedInTime: number;
  /** planned production too late to cure by the delivery date */
  plannedTooLate: number;
}

export interface CommitmentAssessment {
  risk: CommitmentRisk;
  /** how much of the promise has no credible path to the customer */
  shortfall: number;
  /** the date production must have started by, for the message */
  produceBy: string;
  /** true when the only problem is timing, not quantity — the useful nuance */
  timingOnly: boolean;
}

/**
 * Assess ONE committed delivery line.
 *
 * The distinction that earns its keep is `at_risk` versus `uncovered`. Both
 * mean the customer may not get their bricks, but they need opposite
 * responses: `uncovered` means plan some production, while `at_risk` means
 * the bricks exist or are planned and are simply too late — so either the
 * plan moves earlier, or the customer is told now, while there is still time
 * to tell them politely rather than on the morning of the delivery.
 *
 * The three met-states are also kept apart on purpose. "Ready" is bricks in
 * the yard; "curing in time" is bricks that exist but cannot be touched yet;
 * "planned" is a promise resting on a shift that has not run. A planner
 * deciding what to worry about on a Thursday needs those to look different.
 */
export function assessCommitment(input: CommitmentInput): CommitmentAssessment {
  const produceBy = latestProductionDate(input.deliveryDate, input.curingDays);
  const covered = input.readyByDate + input.plannedInTime;
  const shortfall = Math.max(0, input.quantity - covered);

  if (shortfall <= 0) {
    if (input.readyNow >= input.quantity) {
      return { risk: "ready", shortfall: 0, produceBy, timingOnly: false };
    }
    if (input.readyByDate >= input.quantity) {
      return { risk: "curing_in_time", shortfall: 0, produceBy, timingOnly: false };
    }
    return { risk: "planned", shortfall: 0, produceBy, timingOnly: false };
  }

  // There is a gap. Is there stock or plan that would close it if only it
  // were earlier? That is a scheduling problem, not a capacity problem, and
  // it is fixed by moving a plan line rather than by finding more bricks.
  const late = input.curingLate + input.plannedTooLate;
  if (late > 0) {
    return { risk: "at_risk", shortfall, produceBy, timingOnly: late >= shortfall };
  }
  return { risk: "uncovered", shortfall, produceBy, timingOnly: false };
}

/** Severity order, worst first — how the at-risk list sorts itself. */
const RISK_ORDER: Record<CommitmentRisk, number> = {
  uncovered: 0,
  at_risk: 1,
  curing_in_time: 2,
  planned: 3,
  ready: 4,
};

export function riskRank(risk: CommitmentRisk): number {
  return RISK_ORDER[risk];
}

/** Does this risk need a human to do something? */
export function needsAttention(risk: CommitmentRisk): boolean {
  return risk === "uncovered" || risk === "at_risk";
}

// ---------------------------------------------------------------------------
// Production requirement: what the commitments imply, day by day.
// ---------------------------------------------------------------------------

export interface RequirementSource {
  finishedGoodId: string;
  deliveryDate: string;
  /** the part of the commitment not already covered by ready reserved stock */
  outstanding: number;
  curingDays: number;
}

/**
 * Roll commitments back through curing into a per-product, per-day
 * "must be produced by" requirement.
 *
 * Requirements landing BEFORE the window start are not dropped — they are
 * carried into an `overdue` bucket. Silently discarding them would hide the
 * worst commitments in the book: the ones already too late to make.
 */
export function requirementByDay(
  sources: readonly RequirementSource[],
  days: readonly string[],
): {
  byProductDay: Map<string, number>;
  overdueByProduct: Map<string, number>;
  beyondByProduct: Map<string, number>;
} {
  const byProductDay = new Map<string, number>();
  const overdueByProduct = new Map<string, number>();
  const beyondByProduct = new Map<string, number>();
  if (days.length === 0) {
    return { byProductDay, overdueByProduct, beyondByProduct };
  }
  const first = days[0];
  const last = days[days.length - 1];

  for (const s of sources) {
    if (s.outstanding <= 0) continue;
    const produceBy = latestProductionDate(s.deliveryDate, s.curingDays);
    if (produceBy < first) {
      overdueByProduct.set(
        s.finishedGoodId,
        (overdueByProduct.get(s.finishedGoodId) ?? 0) + s.outstanding,
      );
      continue;
    }
    if (produceBy > last) {
      beyondByProduct.set(
        s.finishedGoodId,
        (beyondByProduct.get(s.finishedGoodId) ?? 0) + s.outstanding,
      );
      continue;
    }
    const key = cellKey(s.finishedGoodId, produceBy);
    byProductDay.set(key, (byProductDay.get(key) ?? 0) + s.outstanding);
  }

  return { byProductDay, overdueByProduct, beyondByProduct };
}

/** Grid cells are addressed by product and date; one key shape, everywhere. */
export function cellKey(finishedGoodId: string, date: string): string {
  return `${finishedGoodId}|${date}`;
}

export interface GridTotals {
  byDay: Map<string, number>;
  byProduct: Map<string, number>;
  total: number;
}

/** Row, column and grand totals for a set of cells. */
export function gridTotals(
  cells: readonly { finished_good_id: string; date: string; quantity: number }[],
): GridTotals {
  const byDay = new Map<string, number>();
  const byProduct = new Map<string, number>();
  let total = 0;
  for (const c of cells) {
    const q = Number(c.quantity) || 0;
    byDay.set(c.date, (byDay.get(c.date) ?? 0) + q);
    byProduct.set(c.finished_good_id, (byProduct.get(c.finished_good_id) ?? 0) + q);
    total += q;
  }
  return { byDay, byProduct, total };
}

/**
 * Daily capacity check. Planning more in a day than the factory can make is
 * a WARNING, never a block (PRD §72/§73) — the planner can see the yard and
 * we cannot, and a plan that refuses to be written is a plan kept in a
 * notebook instead.
 */
export function capacityBand(
  planned: number,
  capacity: number | null,
): "ok" | "over" | "not_evaluated" {
  if (capacity === null || capacity <= 0) return "not_evaluated";
  return planned > capacity ? "over" : "ok";
}
