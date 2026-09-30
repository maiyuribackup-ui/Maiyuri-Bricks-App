/**
 * Operations Control — fulfilment calculations (PRD §10-11), pure functions.
 *
 * Three SEPARATE dimensions, deliberately not one status:
 *  - commitmentStatus: what the customer currently holds (reads the ACTIVE
 *    CONFIRMED version — a draft revision does not change it).
 *  - revisionStatus: what is being worked on (the open working version).
 *  - coverageStatus: whether stock/production cover the demand. Phase 2 has
 *    no reservation data, so this is 'not_evaluated' — ABSENCE OF DATA IS
 *    NOT ZERO. Rendering not_evaluated as "uncovered" would present missing
 *    information as bad news.
 */

export function remainingQty(ordered: number, delivered: number): number {
  return Math.max(0, ordered - delivered);
}

/** PRD §10: min 0 — over-coverage never shows as negative uncovered. */
export function uncoveredQty(
  remaining: number,
  reserved: number,
  allocated: number,
): number {
  return Math.max(0, remaining - reserved - allocated);
}

export type CommitmentStatus =
  | "unscheduled"
  | "awaiting_confirmation"
  | "confirmed"
  | "partially_delivered"
  | "completed";

export interface CommitmentInput {
  qtyOrdered: number;
  qtyDelivered: number;
  /** true when the schedule has an active CONFIRMED version */
  hasConfirmedVersion: boolean;
  /** status of the open working version, if any (draft/sent/revision_requested) */
  openVersionStatus: "draft" | "sent" | "revision_requested" | null;
}

export function commitmentStatus(input: CommitmentInput): CommitmentStatus {
  const remaining = remainingQty(input.qtyOrdered, input.qtyDelivered);
  if (input.qtyOrdered > 0 && remaining <= 0) return "completed";
  if (input.qtyDelivered > 0) return "partially_delivered";
  if (input.hasConfirmedVersion) return "confirmed";
  // A sent (or revision-requested) first version means we are waiting on the
  // customer; a draft that was never sent is still "unscheduled" territory —
  // PRD §11 calls that Schedule Draft, which we surface via revisionStatus.
  if (input.openVersionStatus === "sent" || input.openVersionStatus === "revision_requested") {
    return "awaiting_confirmation";
  }
  return "unscheduled";
}

export type RevisionStatus =
  | "none"
  | "draft_revision"
  | "sent_revision"
  | "revision_requested";

/** The working-version dimension: "Confirmed ✓ · V2 revision in draft". */
export function revisionStatus(
  openVersionStatus: "draft" | "sent" | "revision_requested" | null,
): RevisionStatus {
  switch (openVersionStatus) {
    case "draft":
      return "draft_revision";
    case "sent":
      return "sent_revision";
    case "revision_requested":
      return "revision_requested";
    default:
      return "none";
  }
}

export type CoverageStatus =
  | "not_evaluated"
  | "covered"
  | "partially_covered"
  | "uncovered";

export interface CoverageInput {
  remaining: number;
  reserved: number;
  productionAllocated: number;
}

/**
 * Null input means the information does not exist yet (Phase 2), which is a
 * different fact from "zero bricks are reserved". Phase 3 starts passing real
 * inputs; nothing else changes.
 */
export function coverageStatus(input: CoverageInput | null): CoverageStatus {
  if (input === null) return "not_evaluated";
  const { remaining, reserved, productionAllocated } = input;
  if (remaining <= 0) return "covered";
  const covered = reserved + productionAllocated;
  if (covered >= remaining) return "covered";
  if (covered > 0) return "partially_covered";
  return "uncovered";
}

/**
 * PRD §26/§88 over-scheduling check: total scheduled in a version for one SO
 * line must not exceed what is schedulable. Blocking by default; an
 * authorised override is recorded on the version, never silent.
 */
export interface OverscheduleCheck {
  ok: boolean;
  excess: number;
}

export function checkOverschedule(
  scheduledTotal: number,
  qtyOrdered: number,
  qtyDelivered: number,
): OverscheduleCheck {
  const schedulable = remainingQty(qtyOrdered, qtyDelivered);
  const excess = Math.max(0, scheduledTotal - schedulable);
  return { ok: excess === 0, excess };
}

// ---------------------------------------------------------------------------
// Phase 3: coverage and readiness — deliberately two functions, never one.
//
// COVERAGE answers "is this demand accounted for?" (reserved stock plus
// production allocated to it). READINESS answers "can it ship today?".
// A line can be 100% covered and 0% ready for a week while bricks cure, and
// a dashboard that reported one number would be wrong in exactly the way
// that loses a customer's trust:
//
//     SO requirement 900 · reserved 900 · curing until 29 Aug
//     Coverage 100% · Ready today 0% · Ready from 29 Aug
// ---------------------------------------------------------------------------

export interface CoverageResult {
  remaining: number;
  reserved: number;
  productionAllocated: number;
  /** what still needs to be produced or reserved — the real backlog */
  uncovered: number;
  status: CoverageStatus;
}

/** PRD §10: coverage of one SO line, in units rather than a status alone. */
export function computeCoverage(input: {
  qtyOrdered: number;
  qtyDelivered: number;
  reserved: number;
  productionAllocated: number;
}): CoverageResult {
  const remaining = remainingQty(input.qtyOrdered, input.qtyDelivered);
  const uncovered = uncoveredQty(remaining, input.reserved, input.productionAllocated);
  return {
    remaining,
    reserved: input.reserved,
    productionAllocated: input.productionAllocated,
    uncovered,
    status: coverageStatus({
      remaining,
      reserved: input.reserved,
      productionAllocated: input.productionAllocated,
    }),
  };
}

export interface ReadinessResult {
  /** reserved AND dispatchable today */
  readyNow: number;
  /** reserved but still curing */
  curing: number;
  /** the date the curing portion becomes dispatchable, if any */
  readyFrom: string | null;
  /** true only when the whole remaining requirement can ship today */
  fullyReady: boolean;
}

/**
 * Readiness of one SO line: how much of what is reserved for it can actually
 * leave the yard today. `asOf` is a date-only string so this stays pure and
 * timezone-independent (an IST-local Date would make stock dispatchable a day
 * early).
 */
export function computeReadiness(
  reservations: { quantity: number; available_from: string | null; status: string }[],
  remaining: number,
  asOf: string,
): ReadinessResult {
  const active = reservations.filter((r) => r.status === "active");
  const readyNow = active
    .filter((r) => r.available_from === null || r.available_from <= asOf)
    .reduce((sum, r) => sum + r.quantity, 0);
  const curingLines = active.filter(
    (r) => r.available_from !== null && r.available_from > asOf,
  );
  const curing = curingLines.reduce((sum, r) => sum + r.quantity, 0);
  const readyFrom = curingLines
    .map((r) => r.available_from as string)
    .sort()[0] ?? null;

  return {
    readyNow,
    curing,
    readyFrom,
    // Nothing outstanding is trivially ready; otherwise the whole remaining
    // requirement must be dispatchable now.
    fullyReady: remaining <= 0 || readyNow >= remaining,
  };
}
