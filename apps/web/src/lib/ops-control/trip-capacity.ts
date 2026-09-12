/**
 * Operations Control — trip capacity and load utilisation (PRD §41–§56),
 * pure functions.
 *
 * A vehicle's capacity is per PRODUCT — 900 of the 8" or 1,000 of the 6" —
 * so a mixed load cannot be measured by counting bricks. 500 6" plus 450 8"
 * is not 950 of anything; it is half a load of one plus half a load of the
 * other, which is exactly 100%. Utilisation is therefore the sum of
 * FRACTIONS of a full load, never a sum of quantities:
 *
 *     utilisation = Σ (qty for product ÷ full load for that product)
 *
 * The PRD's cases: 500×6" + 450×8" = 100%; 600 + 450 = 110%, which is
 * over-capacity and must be SAVEABLE with a red warning (§72/§73). Nothing
 * here blocks. Only physical reconciliation blocks — a load plan that looks
 * wrong is a judgement call, and the person in the yard can see the vehicle.
 */

import {
  resolveVehicleCapacity,
  type VehicleCapacity,
} from "@/lib/ops-control/rates";

export interface LoadItem {
  finished_good_id: string;
  quantity: number;
}

export type UtilisationBand = "not_evaluated" | "red_under" | "amber" | "green" | "red_over";

export interface UtilisationResult {
  /** total load as a fraction of vehicle capacity, in percent */
  pct: number | null;
  band: UtilisationBand;
  /** products on the load with no capacity configured for this vehicle */
  unpricedProducts: string[];
}

/**
 * Utilisation of one trip's load against one vehicle, on a date.
 *
 * Effective dating matters because a vehicle's rated capacity can change —
 * a re-bodied tipper carries a different count — and an August trip must be
 * judged by August's rating.
 *
 * A product with no capacity row cannot be measured. It is NOT treated as
 * zero: that would quietly understate the load and let a genuinely
 * over-loaded vehicle show green. It is named in `unpricedProducts` and the
 * band degrades to `not_evaluated`, because a number nobody can trust is
 * worse than an admission that the master data is incomplete.
 */
export function tripUtilisation(input: {
  items: readonly LoadItem[];
  capacities: readonly VehicleCapacity[];
  vehicleId: string;
  onDate: string;
  thresholds: { greenMinPct: number; yellowMinPct: number; redAbovePct: number };
}): UtilisationResult {
  const unpricedProducts: string[] = [];
  let pct = 0;

  for (const item of input.items) {
    if (item.quantity <= 0) continue;
    const capacity = resolveVehicleCapacity(
      input.capacities,
      input.vehicleId,
      item.finished_good_id,
      input.onDate,
    );
    if (!capacity || capacity.full_load_qty <= 0) {
      unpricedProducts.push(item.finished_good_id);
      continue;
    }
    pct += (item.quantity / capacity.full_load_qty) * 100;
  }

  if (unpricedProducts.length > 0) {
    return { pct: null, band: "not_evaluated", unpricedProducts };
  }
  if (input.items.every((i) => i.quantity <= 0)) {
    return { pct: 0, band: "not_evaluated", unpricedProducts };
  }

  return { pct, band: utilisationBand(pct, input.thresholds), unpricedProducts };
}

/**
 * Band a utilisation percentage.
 *
 * Both ends are bad and for different reasons: over 100% is a vehicle that
 * physically cannot carry the load, and well under is a trip whose diesel and
 * driver are being spent to move half a load. The bands come from oc_settings
 * so the business can retune them without a deploy.
 */
export function utilisationBand(
  pct: number,
  thresholds: { greenMinPct: number; yellowMinPct: number; redAbovePct: number },
): UtilisationBand {
  if (pct > thresholds.redAbovePct) return "red_over";
  if (pct >= thresholds.greenMinPct) return "green";
  if (pct >= thresholds.yellowMinPct) return "amber";
  return "red_under";
}

export interface TripWarning {
  code: "over_capacity" | "under_utilised" | "extra_trip" | "capacity_unknown";
  severity: "warning" | "info";
  message: string;
}

/**
 * The three planning warnings of §72/§73, plus the honest fourth.
 *
 * All of them WARN. None of them blocks — every one is a judgement the person
 * in the yard is better placed to make than a threshold in a settings table.
 * An over-capacity load can be saved; it just cannot be saved silently.
 */
export function tripWarnings(input: {
  utilisation: UtilisationResult;
  tripNo: number;
  normalMaxTripsPerDay: number;
  productNames?: Record<string, string>;
}): TripWarning[] {
  const warnings: TripWarning[] = [];
  const { utilisation: u } = input;

  if (u.unpricedProducts.length > 0) {
    const names = u.unpricedProducts
      .map((id) => input.productNames?.[id] ?? id)
      .join(", ");
    warnings.push({
      code: "capacity_unknown",
      severity: "warning",
      message: `No load capacity is configured for ${names} on this vehicle, so utilisation cannot be checked.`,
    });
  } else if (u.pct !== null) {
    if (u.band === "red_over") {
      warnings.push({
        code: "over_capacity",
        severity: "warning",
        message: `This load is ${u.pct.toFixed(0)}% of the vehicle — more than it can carry.`,
      });
    } else if (u.band === "red_under" || u.band === "amber") {
      warnings.push({
        code: "under_utilised",
        severity: "info",
        message: `This trip is only ${u.pct.toFixed(0)}% loaded — consider combining it.`,
      });
    }
  }

  if (input.tripNo > input.normalMaxTripsPerDay) {
    warnings.push({
      code: "extra_trip",
      severity: "warning",
      message: `Trip ${input.tripNo} is beyond the usual ${input.normalMaxTripsPerDay} per day — record why.`,
    });
  }

  return warnings;
}

export interface ReconciliationInput {
  loaded: number;
  unloaded: number;
  returned: number;
  damaged: number;
  lostOrShort: number;
}

export interface ReconciliationResult {
  accounted: number;
  unexplained: number;
  balanced: boolean;
  /** inventory effect: what left, less what came back (§7) */
  netInventoryImpact: number;
  /** what the customer actually received — a different fact entirely (§7) */
  customerFulfilment: number;
}

/**
 * The §7 identity, as a pure function so the screen can show the operator
 * exactly what COMPLETE will decide before they press it.
 *
 * Damaged stock deliberately does NOT come back into inventory: the issue
 * already removed it and it is not coming back. It reduces what the customer
 * received, and it is reported separately for quality analysis.
 */
export function reconcileDelivery(input: ReconciliationInput): ReconciliationResult {
  const accounted =
    input.unloaded + input.returned + input.damaged + input.lostOrShort;
  return {
    accounted,
    unexplained: input.loaded - accounted,
    balanced: accounted === input.loaded,
    netInventoryImpact: input.returned - input.loaded,
    customerFulfilment: input.unloaded,
  };
}
