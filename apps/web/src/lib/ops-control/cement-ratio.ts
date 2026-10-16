/**
 * Operations Control — cement consumption ratio (PRD §33–§38), pure functions.
 *
 * The question this answers is "are we using the right amount of cement per
 * brick?", and it is a cost-control question with real money in it: a 10%
 * ratio drift across a month is a material loss that nobody notices without
 * a number on a screen.
 *
 * TWO RULES THAT LOOK LIKE DETAILS AND ARE NOT:
 *
 * 1. THE RATIO USES GROSS OUTPUT, NOT ACCEPTED (§35). Cement was consumed by
 *    every brick that came out of the machine, including the ones later
 *    rejected. Dividing by accepted output would flatter the ratio precisely
 *    when quality is worst — exactly when the number needs to be honest.
 *
 * 2. NO STANDARD MEANS NOT EVALUATED, NOT "BAD" (§100). The consumption
 *    standards are deliberately unseeded: the business supplies them. Until
 *    a product has one, its ratio is reported as a fact with no verdict —
 *    rendering it as red would train people to ignore red.
 *
 * The previous implementation computed this inline in an API route with no
 * standard, no tolerance and no test. That is what this module replaces.
 */

import {
  resolveConsumptionStandard,
  type ConsumptionStandard,
} from "@/lib/ops-control/rates";

/** Bricks produced per bag of cement — the headline ratio. */
export function bricksPerBag(grossQty: number, bags: number): number | null {
  // Zero bags is not a ratio of infinity, it is a missing measurement.
  if (!Number.isFinite(grossQty) || !Number.isFinite(bags) || bags <= 0) {
    return null;
  }
  if (grossQty < 0) return null;
  return grossQty / bags;
}

export type RatioBand = "not_evaluated" | "green" | "amber" | "red";

export interface RatioTolerances {
  /** deviation beyond this is amber, in percent */
  amberPct: number;
  /** deviation beyond this is red, in percent */
  redPct: number;
}

export interface RatioAssessment {
  /** actual bricks per bag, null when it cannot be computed */
  actual: number | null;
  /** the standard in force on the production date, null when none is set */
  standard: number | null;
  /** signed deviation from standard, in percent; negative = fewer bricks per
   *  bag than expected, i.e. cement is being over-used */
  deviationPct: number | null;
  band: RatioBand;
  /** which standard row was used, for the audit trail */
  standardId: string | null;
}

/**
 * Band the actual ratio against the standard in force ON THE PRODUCTION DATE.
 *
 * Effective dating matters here for the same reason it matters for rates: an
 * August production record must be judged against August's recipe, even after
 * September's is entered. `resolveConsumptionStandard` does that lookup; this
 * function only decides the verdict.
 *
 * A per-product `tolerance_pct` on the standard overrides the global amber
 * threshold — some products are inherently more variable than others — while
 * red stays global, because red means "investigate today".
 */
export function assessRatio(input: {
  grossQty: number;
  bags: number;
  standards: readonly ConsumptionStandard[];
  finishedGoodId: string;
  onDate: string;
  tolerances: RatioTolerances;
  material?: string;
}): RatioAssessment {
  const actual = bricksPerBag(input.grossQty, input.bags);
  const standard = resolveConsumptionStandard(
    input.standards,
    input.finishedGoodId,
    input.material ?? "cement",
    input.onDate,
  );

  if (actual === null || standard === null || standard.standard_yield <= 0) {
    return {
      actual,
      standard: standard?.standard_yield ?? null,
      deviationPct: null,
      band: "not_evaluated",
      standardId: standard?.id ?? null,
    };
  }

  const deviationPct =
    ((actual - standard.standard_yield) / standard.standard_yield) * 100;
  const magnitude = Math.abs(deviationPct);

  // The per-product tolerance widens amber only; red is the global line.
  const amber = standard.tolerance_pct ?? input.tolerances.amberPct;
  const red = input.tolerances.redPct;

  let band: RatioBand;
  if (magnitude > red) band = "red";
  else if (magnitude > amber) band = "amber";
  else band = "green";

  return {
    actual,
    standard: standard.standard_yield,
    deviationPct,
    band,
    standardId: standard.id,
  };
}

/**
 * Is this a legal bag entry for the configured step?
 *
 * Cement is issued in half bags, so 4.5 is real and 4.3 is a typo. The step
 * lives in oc_settings rather than a CHECK constraint because the business
 * may change how finely it measures (PRD §33).
 */
export function isValidBagStep(bags: number, step: number): boolean {
  if (!Number.isFinite(bags) || bags < 0) return false;
  if (!Number.isFinite(step) || step <= 0) return true; // unconfigured: allow
  // Scale to integers before the modulo: 4.5 % 0.5 is 0.49999... in binary
  // floating point, which would reject a perfectly valid entry.
  const scale = Math.round(1 / step);
  return Math.abs(bags * scale - Math.round(bags * scale)) < 1e-9;
}
