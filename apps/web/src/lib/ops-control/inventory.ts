/**
 * Operations Control — inventory derivation (PRD §3, §4), pure functions.
 *
 * THE AUTHORITY CONTRACT, in one sentence: Odoo owns the quantity, OC owns
 * the explanation. Every number here is DERIVED from Odoo's on-hand figure
 * plus OC's ledger; nothing is stored, so nothing can drift from its inputs.
 * When OC's own movements disagree with Odoo, `reconcile` reports it as an
 * exception to investigate — OC never adopts its own total as the truth.
 *
 * The four buckets exist because "covered" and "ready" are different facts
 * (§4). Bricks produced today for SO-A are reserved from the moment
 * production is posted — otherwise another planner earmarks them for SO-B —
 * but they cannot ship until curing finishes:
 *
 *     SO requirement 900 · produced and reserved 900 · curing until 29 Aug
 *     Coverage 100% · Ready today 0% · Ready from 29 Aug
 *
 * A dashboard that collapsed those into one number would be wrong by a week.
 */

export interface InventoryMovement {
  finished_good_id: string;
  /** signed: receipts positive, issues negative */
  quantity: number;
  movement_date: string; // YYYY-MM-DD
  /** receipts only; null means immediately dispatchable */
  available_from: string | null;
}

export interface StockReservation {
  finished_good_id: string;
  quantity: number;
  /** null means the reservation is against stock that is ready now */
  available_from: string | null;
  status: "active" | "released" | "consumed";
}

export interface InventoryBuckets {
  /** Odoo's qty_available — the authoritative physical count */
  physicalOnHand: number;
  /** produced but not yet dispatchable */
  curing: number;
  /** physically present AND dispatchable today */
  readyPhysical: number;
  /** earmarked for an SO and dispatchable today */
  reservedReady: number;
  /** earmarked for an SO but still curing */
  reservedCuring: number;
  /** dispatchable and unspoken for — the only number safe to promise */
  freeReady: number;
  /** curing and unspoken for */
  freeCuring: number;
  /** earliest date any curing stock becomes dispatchable, if any */
  nextReadyFrom: string | null;
}

/** Date-only comparison; ISO strings sort lexicographically, no Date parsing. */
function isCuring(availableFrom: string | null, asOf: string): boolean {
  return availableFrom !== null && availableFrom > asOf;
}

/**
 * Derive the four buckets for ONE product.
 *
 * `odooOnHand` is authoritative for the physical total. OC's movements are
 * used only to explain how much of that total is still curing — which is a
 * question Odoo cannot answer, because curing is an operational rule, not a
 * stock location.
 */
export function deriveBuckets(
  odooOnHand: number,
  movements: InventoryMovement[],
  reservations: StockReservation[],
  asOf: string,
): InventoryBuckets {
  const curing = movements
    .filter((m) => m.quantity > 0 && isCuring(m.available_from, asOf))
    .reduce((sum, m) => sum + m.quantity, 0);

  // Odoo is the ceiling. If OC believes more is curing than Odoo says exists,
  // the ledger is ahead of reality (an unsynced receipt, or a drift worth
  // investigating) — we clamp rather than report negative ready stock, and
  // `reconcile` surfaces the discrepancy separately.
  const curingClamped = Math.min(Math.max(0, curing), Math.max(0, odooOnHand));
  const readyPhysical = Math.max(0, odooOnHand - curingClamped);

  const active = reservations.filter((r) => r.status === "active");
  const reservedCuring = active
    .filter((r) => isCuring(r.available_from, asOf))
    .reduce((sum, r) => sum + r.quantity, 0);
  const reservedReadyRaw = active
    .filter((r) => !isCuring(r.available_from, asOf))
    .reduce((sum, r) => sum + r.quantity, 0);

  // A reservation can only be "ready" to the extent ready stock exists to
  // back it. Promising more than is physically present is exactly the failure
  // this module is here to prevent.
  const reservedReady = Math.min(reservedReadyRaw, readyPhysical);

  const readyDates = movements
    .filter((m) => m.quantity > 0 && isCuring(m.available_from, asOf))
    .map((m) => m.available_from as string)
    .sort();

  return {
    physicalOnHand: odooOnHand,
    curing: curingClamped,
    readyPhysical,
    reservedReady,
    reservedCuring,
    freeReady: Math.max(0, readyPhysical - reservedReady),
    freeCuring: Math.max(0, curingClamped - reservedCuring),
    nextReadyFrom: readyDates[0] ?? null,
  };
}

/** A receipt's dispatchable date: production date + the product's curing days. */
export function availableFrom(receiptDate: string, curingDays: number): string {
  const [y, m, d] = receiptDate.split("-").map(Number);
  if (!y || !m || !d) return receiptDate;
  // Date arithmetic in UTC only — a local-timezone Date would shift the day
  // across the IST boundary and make stock dispatchable a day early.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.trunc(curingDays)));
  return dt.toISOString().slice(0, 10);
}

export interface ReconciliationResult {
  odooOnHand: number;
  /** what OC's own movements sum to */
  ledgerBalance: number;
  /** ledger − Odoo: positive means OC thinks there is more than Odoo does */
  drift: number;
  /** true when the two disagree beyond the tolerance */
  hasDrift: boolean;
}

/**
 * Compare OC's ledger against Odoo's on-hand figure.
 *
 * Drift is REPORTED, never absorbed (PRD §86). A tolerance exists because
 * fractional rounding should not raise an exception, but a real difference
 * must reach a human: it usually means an unsynced write-back, a stock move
 * made directly in Odoo, or a missing operational record — all things that
 * want investigating rather than papering over.
 */
export function reconcile(
  odooOnHand: number,
  movements: InventoryMovement[],
  tolerance = 0.01,
): ReconciliationResult {
  const ledgerBalance = movements.reduce((sum, m) => sum + m.quantity, 0);
  const drift = ledgerBalance - odooOnHand;
  return {
    odooOnHand,
    ledgerBalance,
    drift,
    hasDrift: Math.abs(drift) > tolerance,
  };
}
