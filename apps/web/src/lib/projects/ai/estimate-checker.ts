/**
 * AI Estimate Checker (§26). Deterministic rule-based checks over the BOQ —
 * runs instantly with no LLM call, so it's reliable and free. Flags the common
 * estimation gaps before a budget is approved.
 */
import type { BoqItem, CostCategory } from "@maiyuri/shared";

export interface EstimateWarning {
  type: string;
  message: string;
  severity: "low" | "medium" | "high";
}

const TARGET_MARGIN_PCT = 15;

export function checkEstimate(
  boqItems: Array<Pick<BoqItem, "name" | "cost_category" | "quantity" | "cost_rate" | "selling_rate" | "cost_amount" | "revenue_amount">>,
): EstimateWarning[] {
  const warnings: EstimateWarning[] = [];
  const cats = new Set<CostCategory>(boqItems.map((b) => b.cost_category));

  const totalCost = boqItems.reduce((s, b) => s + (Number(b.cost_amount) || 0), 0);
  const totalRevenue = boqItems.reduce((s, b) => s + (Number(b.revenue_amount) || 0), 0);
  const marginPct = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

  if (!cats.has("transport")) {
    warnings.push({ type: "missing_transport", severity: "high", message: "No transport line — delivery cost may be missing." });
  }
  if (!cats.has("unloading") && !cats.has("loading")) {
    warnings.push({ type: "missing_handling", severity: "medium", message: "No loading/unloading line — handling cost may be missing." });
  }
  if (totalRevenue > 0 && marginPct < TARGET_MARGIN_PCT) {
    warnings.push({
      type: "low_margin",
      severity: "high",
      message: `Forecast margin is ${marginPct.toFixed(1)}% — below the ${TARGET_MARGIN_PCT}% target.`,
    });
  }
  if (!cats.has("miscellaneous")) {
    warnings.push({ type: "no_contingency", severity: "low", message: "No miscellaneous/contingency line added." });
  }

  const zeroQty = boqItems.filter((b) => !(Number(b.quantity) > 0));
  if (zeroQty.length > 0) {
    warnings.push({
      type: "zero_quantity",
      severity: "medium",
      message: `${zeroQty.length} BOQ line(s) have zero quantity — estimate looks incomplete.`,
    });
  }

  const negative = boqItems.filter(
    (b) => Number(b.selling_rate) > 0 && Number(b.selling_rate) < Number(b.cost_rate),
  );
  if (negative.length > 0) {
    warnings.push({
      type: "negative_margin_line",
      severity: "high",
      message: `${negative.length} line(s) sell below cost.`,
    });
  }

  if (totalRevenue === 0 && totalCost === 0) {
    warnings.push({ type: "empty_estimate", severity: "medium", message: "Estimate has no priced lines yet." });
  }

  return warnings;
}
