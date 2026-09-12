export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";
import type { CbsVarianceRow } from "@maiyuri/shared";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Traffic-light thresholds (variance_pct = over-budget percentage)
// variance_pct ≤ 0  → under_budget  (committed_forecast ≤ budget)
// 0 < pct ≤ 5       → watch
// 5 < pct ≤ 10      → risk
// pct > 10          → critical
function trafficLight(
  variancePct: number
): CbsVarianceRow["status"] {
  if (variancePct <= 0) return "under_budget";
  if (variancePct <= 5) return "watch";
  if (variancePct <= 10) return "risk";
  return "critical";
}

// GET /api/projects/[id]/variance
// Core cost report: for each CBS code that has a budget OR an actual cost entry,
// returns budget vs actual and computes the variance.
//
// Phase 1: committed_forecast = actual only.
// Phase 2 will add open PO/subcontract balances.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { id } = await params;

    // --- Budget side: aggregate current_budget_amount per cbs_id ---
    const { data: budgetRows, error: budgetErr } = await supabaseAdmin
      .from("project_budgets")
      .select("cbs_id, current_budget_amount")
      .eq("project_id", id);

    if (budgetErr) return error("Failed to load budgets", 500);

    // Group by cbs_id
    const budgetByCbs: Record<string, number> = {};
    for (const row of budgetRows ?? []) {
      budgetByCbs[row.cbs_id] =
        (budgetByCbs[row.cbs_id] ?? 0) + (row.current_budget_amount ?? 0);
    }

    // --- Actual side: sum approved cost_entries per cbs_id ---
    const { data: costRows, error: costErr } = await supabaseAdmin
      .from("cost_entries")
      .select("cbs_id, amount, approval_status")
      .eq("project_id", id)
      .not("cbs_id", "is", null);

    if (costErr) return error("Failed to load cost entries", 500);

    const actualByCbs: Record<string, number> = {};
    for (const row of costRows ?? []) {
      if (row.approval_status === "approved" && row.cbs_id) {
        actualByCbs[row.cbs_id] =
          (actualByCbs[row.cbs_id] ?? 0) + (row.amount ?? 0);
      }
    }

    // --- Collect all cbs_ids that appear in either ledger ---
    const allCbsIds = Array.from(
      new Set([
        ...Object.keys(budgetByCbs),
        ...Object.keys(actualByCbs),
      ])
    );

    if (allCbsIds.length === 0) {
      return success({
        rows: [],
        summary: {
          totalBudget: 0,
          totalActual: 0,
          totalVariance: 0,
          forecastProfit: 0,
        },
      });
    }

    // --- Load CBS master data for those ids ---
    const { data: cbsItems, error: cbsErr } = await supabaseAdmin
      .from("cbs_master")
      .select("id, cbs_code, category, work_item, cost_type")
      .in("id", allCbsIds);

    if (cbsErr) return error("Failed to load CBS master", 500);

    const cbsById: Record<
      string,
      { cbs_code: string; category: string; work_item: string; cost_type: string }
    > = {};
    for (const c of cbsItems ?? []) {
      cbsById[c.id] = {
        cbs_code: c.cbs_code,
        category: c.category,
        work_item: c.work_item,
        cost_type: c.cost_type,
      };
    }

    // --- Build variance rows ---
    const rows: CbsVarianceRow[] = allCbsIds
      .map((cbsId) => {
        const cbs = cbsById[cbsId];
        if (!cbs) return null;

        const budget = budgetByCbs[cbsId] ?? 0;
        const actual = actualByCbs[cbsId] ?? 0;
        // Phase 1: committed_forecast = actual only (Phase 2 adds commitments)
        const committedForecast = actual;
        const variance = budget - committedForecast;
        // variance_pct: how many percent over-budget is committed_forecast?
        const variancePct =
          budget > 0
            ? ((committedForecast - budget) / budget) * 100
            : committedForecast > 0
            ? 100 // no budget but has actuals → fully over
            : 0;

        return {
          cbs_id: cbsId,
          cbs_code: cbs.cbs_code,
          category: cbs.category,
          work_item: cbs.work_item,
          cost_type: cbs.cost_type,
          budget,
          actual,
          committed_forecast: committedForecast,
          variance,
          variance_pct: Math.round(variancePct * 100) / 100,
          status: trafficLight(variancePct),
        } satisfies CbsVarianceRow;
      })
      .filter((r): r is CbsVarianceRow => r !== null)
      .sort((a, b) => a.cbs_code.localeCompare(b.cbs_code));

    // --- Summary ---
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    const totalVariance = rows.reduce((s, r) => s + r.variance, 0);
    // forecastProfit is a placeholder; real P&L (revenue - cost) in Phase 5
    const forecastProfit = totalVariance;

    return success({
      rows,
      summary: {
        totalBudget,
        totalActual,
        totalVariance,
        forecastProfit,
      },
    });
  } catch (err) {
    console.error("variance GET error:", err);
    return error("Internal server error", 500);
  }
}
