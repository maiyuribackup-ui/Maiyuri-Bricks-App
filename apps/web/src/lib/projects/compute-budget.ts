/**
 * Project budget math — single source of truth for BOQ line economics,
 * estimate roll-ups, and budget-vs-actual. Pure functions, no I/O.
 */
import type { BoqItem, WbsItem, CostEntry } from "@maiyuri/shared";

export interface BoqLineComputed {
  cost_amount: number;
  revenue_amount: number;
  margin_amount: number;
}

/** Compute a single BOQ line's cost/revenue/margin from qty + rates. */
export function computeBoqLine(input: {
  quantity?: number | null;
  cost_rate?: number | null;
  selling_rate?: number | null;
}): BoqLineComputed {
  const qty = Number(input.quantity) || 0;
  const cost = qty * (Number(input.cost_rate) || 0);
  const revenue = qty * (Number(input.selling_rate) || 0);
  return {
    cost_amount: Math.round(cost),
    revenue_amount: Math.round(revenue),
    margin_amount: Math.round(revenue - cost),
  };
}

export interface EstimateRollup {
  total_cost: number;
  total_revenue: number;
  margin_amount: number;
  margin_pct: number;
}

/** Roll up a set of BOQ lines into estimate totals. */
export function rollupEstimate(
  items: Array<Pick<BoqItem, "quantity" | "cost_rate" | "selling_rate">>,
): EstimateRollup {
  let total_cost = 0;
  let total_revenue = 0;
  for (const it of items) {
    const c = computeBoqLine(it);
    total_cost += c.cost_amount;
    total_revenue += c.revenue_amount;
  }
  const margin_amount = total_revenue - total_cost;
  const margin_pct =
    total_revenue > 0 ? Math.round((margin_amount / total_revenue) * 1000) / 10 : 0;
  return { total_cost, total_revenue, margin_amount, margin_pct };
}

export interface BudgetVsActual {
  approvedBudget: number;
  actualCost: number;
  forecastCost: number;
  variance: number; // budget - forecast (positive = under)
  budgetUsedPct: number; // actual / budget
  progressPct: number; // weighted by planned budget
  forecastMargin: number;
  costHealth: "under_budget" | "on_budget" | "at_risk" | "over_budget";
}

/**
 * Budget-vs-actual roll-up for a project.
 * Forecast cost = actual + (remaining work × planned burn rate), approximated
 * per-WBS as planned_budget × (1 - progress) added to actual.
 */
export function computeBudgetVsActual(args: {
  approvedBudget: number;
  expectedRevenue: number;
  wbs: Array<Pick<WbsItem, "planned_budget" | "progress_pct" | "actual_cost">>;
  costs: Array<Pick<CostEntry, "amount">>;
}): BudgetVsActual {
  const approvedBudget = Number(args.approvedBudget) || 0;
  const actualCost = args.costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  // Weighted progress by planned budget (falls back to simple average).
  const totalPlanned = args.wbs.reduce(
    (s, w) => s + (Number(w.planned_budget) || 0),
    0,
  );
  let progressPct = 0;
  if (totalPlanned > 0) {
    progressPct =
      args.wbs.reduce(
        (s, w) =>
          s + (Number(w.planned_budget) || 0) * (Number(w.progress_pct) || 0),
        0,
      ) / totalPlanned;
  } else if (args.wbs.length > 0) {
    progressPct =
      args.wbs.reduce((s, w) => s + (Number(w.progress_pct) || 0), 0) /
      args.wbs.length;
  }
  progressPct = Math.round(progressPct);

  // Forecast: actual cost + estimated cost of remaining work.
  const remaining = args.wbs.reduce((s, w) => {
    const planned = Number(w.planned_budget) || 0;
    const prog = (Number(w.progress_pct) || 0) / 100;
    return s + Math.max(0, planned * (1 - prog));
  }, 0);
  const forecastCost = Math.round(actualCost + remaining);
  const variance = Math.round(approvedBudget - forecastCost);
  const budgetUsedPct =
    approvedBudget > 0 ? Math.round((actualCost / approvedBudget) * 100) : 0;
  const forecastMargin = Math.round((Number(args.expectedRevenue) || 0) - forecastCost);

  let costHealth: BudgetVsActual["costHealth"] = "on_budget";
  if (approvedBudget > 0) {
    if (forecastCost > approvedBudget * 1.02) costHealth = "over_budget";
    else if (forecastCost > approvedBudget * 0.95) costHealth = "at_risk";
    else costHealth = "under_budget";
  }

  return {
    approvedBudget,
    actualCost,
    forecastCost,
    variance,
    budgetUsedPct,
    progressPct,
    forecastMargin,
    costHealth,
  };
}
