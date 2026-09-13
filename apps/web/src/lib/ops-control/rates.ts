/**
 * Operations Control — effective-dated rate and standard resolution.
 *
 * Pure functions only: no database, no clock, no I/O, so every rule here is
 * directly testable (PRD §98 — critical formulas must not depend on frontend
 * logic and must be tested independently).
 *
 * PRD §60: "August operational records must continue using Rs.7. Historical
 * calculations must never silently change because the current master was
 * updated." That is enforced twice — here at resolution time, and again by the
 * snapshot written onto every labour ledger entry (PRD §61).
 */

/** The shape any effective-dated master row shares. */
export interface EffectiveDated {
  id: string;
  effective_from: string; // YYYY-MM-DD
  effective_to: string | null; // null = still in force
  active: boolean;
}

export interface ActivityRate extends EffectiveDated {
  finished_good_id: string;
  activity_code: string;
  rate: number;
  uom: string;
}

export interface ConsumptionStandard extends EffectiveDated {
  finished_good_id: string;
  material: string;
  standard_yield: number;
  tolerance_pct: number | null;
}

export interface VehicleCapacity extends EffectiveDated {
  vehicle_id: string;
  finished_good_id: string;
  full_load_qty: number;
}

/**
 * The snapshot stored on a ledger entry so an approved settlement stays
 * reproducible even after the master changes (PRD §61).
 */
export interface RateSnapshot {
  rate: number;
  rate_id: string;
  rate_effective_from: string;
  uom: string;
}

/**
 * Is `onDate` inside this row's effective period?
 *
 * Both ends are INCLUSIVE, matching the database EXCLUDE constraint's
 * `daterange(effective_from, effective_to, '[]')`. A row ending 31 Aug still
 * applies ON 31 Aug; one starting 1 Sep applies from 1 Sep. The two do not
 * overlap, which is why both can be active at once.
 *
 * Dates are compared as ISO strings, never as Date objects: `new Date(iso)`
 * parses as UTC midnight, which is the previous day in IST and would silently
 * shift every boundary by one day.
 */
export function isEffectiveOn(row: EffectiveDated, onDate: string): boolean {
  if (!row.active) return false;
  if (onDate < row.effective_from) return false;
  if (row.effective_to !== null && onDate > row.effective_to) return false;
  return true;
}

/**
 * Pick the row in force on a date. The database prevents overlapping active
 * periods, but this is defensive: if two ever overlap, the one that started
 * most recently wins, which is the least surprising reading.
 */
export function resolveEffective<T extends EffectiveDated>(
  rows: readonly T[],
  onDate: string,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!isEffectiveOn(row, onDate)) continue;
    if (best === null || row.effective_from > best.effective_from) best = row;
  }
  return best;
}

/**
 * Resolve the labour rate for a product + activity on a date.
 * Returns null when no rate is configured — the caller must surface that
 * rather than defaulting, because a silent zero would understate wages owed.
 */
export function resolveRate(
  rates: readonly ActivityRate[],
  finishedGoodId: string,
  activityCode: string,
  onDate: string,
): RateSnapshot | null {
  const candidates = rates.filter(
    (r) => r.finished_good_id === finishedGoodId && r.activity_code === activityCode,
  );
  const match = resolveEffective(candidates, onDate);
  if (!match) return null;
  return {
    rate: match.rate,
    rate_id: match.id,
    rate_effective_from: match.effective_from,
    uom: match.uom,
  };
}

/** Resolve the cement standard for a product + material on a date. */
export function resolveConsumptionStandard(
  standards: readonly ConsumptionStandard[],
  finishedGoodId: string,
  material: string,
  onDate: string,
): ConsumptionStandard | null {
  return resolveEffective(
    standards.filter(
      (s) => s.finished_good_id === finishedGoodId && s.material === material,
    ),
    onDate,
  );
}

/** Resolve a vehicle's full-load capacity for a product on a date. */
export function resolveVehicleCapacity(
  capacities: readonly VehicleCapacity[],
  vehicleId: string,
  finishedGoodId: string,
  onDate: string,
): VehicleCapacity | null {
  return resolveEffective(
    capacities.filter(
      (c) => c.vehicle_id === vehicleId && c.finished_good_id === finishedGoodId,
    ),
    onDate,
  );
}

/**
 * Labour amount for one activity line (PRD §62):
 *   eligible actual quantity x applicable product activity rate.
 *
 * Rounded to paise. Returns the snapshot alongside so the caller can persist
 * both together — an amount without its rate is not reproducible.
 */
export function calculateLabourAmount(
  eligibleQty: number,
  snapshot: RateSnapshot,
): number {
  return Math.round(eligibleQty * snapshot.rate * 100) / 100;
}
