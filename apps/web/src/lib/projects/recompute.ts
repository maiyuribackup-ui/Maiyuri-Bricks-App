/**
 * Recompute a project's roll-ups from its WBS + cost entries and persist them
 * onto the project row (so the list/overview reflect live progress without
 * recomputing on every read). Called after a daily-progress or cost write.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computeBudgetVsActual } from "@/lib/projects/compute-budget";
import type { ProjectHealth } from "@maiyuri/shared";

export async function recomputeProject(projectId: string): Promise<void> {
  const [{ data: project }, { data: wbs }, { data: costs }] = await Promise.all([
    supabaseAdmin
      .from("projects")
      .select("approved_budget, expected_revenue, status")
      .eq("id", projectId)
      .single(),
    supabaseAdmin
      .from("project_wbs_items")
      .select("id, code, planned_budget, progress_pct, actual_cost, status")
      .eq("project_id", projectId),
    supabaseAdmin
      .from("cost_entries")
      .select("amount, wbs_code")
      .eq("project_id", projectId),
  ]);
  if (!project) return;

  // Roll actual cost into each WBS by wbs_code.
  const costByWbs = new Map<string, number>();
  (costs || []).forEach((c: any) => {
    if (!c.wbs_code) return;
    costByWbs.set(c.wbs_code, (costByWbs.get(c.wbs_code) || 0) + (Number(c.amount) || 0));
  });
  for (const w of wbs || []) {
    const actual = costByWbs.get((w as any).code) || 0;
    if (actual !== Number((w as any).actual_cost)) {
      await supabaseAdmin
        .from("project_wbs_items")
        .update({ actual_cost: actual })
        .eq("id", (w as any).id);
    }
  }

  const budget = computeBudgetVsActual({
    approvedBudget: project.approved_budget ?? 0,
    expectedRevenue: project.expected_revenue ?? 0,
    wbs: (wbs || []) as any,
    costs: (costs || []) as any,
  });

  // Derive health: over-budget dominates; else any delayed WBS → delayed;
  // else at-risk if forecast near/over budget; else on track.
  let health: ProjectHealth = "on_track";
  const anyDelayed = (wbs || []).some((w: any) => ["delayed", "at_risk", "blocked"].includes(w.status));
  if (budget.costHealth === "over_budget") health = "over_budget";
  else if (anyDelayed) health = "delayed";
  else if (budget.costHealth === "at_risk") health = "at_risk";

  await supabaseAdmin
    .from("projects")
    .update({
      progress_pct: budget.progressPct,
      forecast_cost: budget.forecastCost,
      forecast_margin: budget.forecastMargin,
      health_status: health,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
}
