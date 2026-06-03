export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, notFound, forbidden, parseBody } from "@/lib/api-utils";
import { updateProjectEstimateSchema } from "@maiyuri/shared";
import { computeBoqLine, rollupEstimate } from "@/lib/projects/compute-budget";
import { checkEstimate } from "@/lib/projects/ai/estimate-checker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function latestEstimate(projectId: string) {
  const { data } = await supabaseAdmin
    .from("project_estimates")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// GET — latest estimate + its BOQ items
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const estimate = await latestEstimate(id);
    const { data: boq } = await supabaseAdmin
      .from("boq_items")
      .select("*")
      .eq("project_id", id);
    return success({
      estimate: estimate ?? null,
      boqItems: boq || [],
      warnings: checkEstimate((boq || []) as any),
    });
  } catch (err) {
    console.error("estimate GET error:", err);
    return error("Internal server error", 500);
  }
}

// PATCH — replace BOQ lines (recompute each + totals). Draft editing only.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateProjectEstimateSchema);
    if (parsed.error) return parsed.error;

    const estimate = await latestEstimate(id);
    if (!estimate) return notFound("Estimate not found");
    if (estimate.status === "approved") {
      return error("Approved baseline is frozen. Use a change order.", 409);
    }

    const items = parsed.data.items ?? [];
    if (parsed.data.items) {
      // Replace strategy: clear existing lines for this estimate, re-insert.
      await supabaseAdmin.from("boq_items").delete().eq("estimate_id", estimate.id);
      if (items.length > 0) {
        await supabaseAdmin.from("boq_items").insert(
          items.map((it, i) => {
            const c = computeBoqLine(it);
            return {
              project_id: id,
              estimate_id: estimate.id,
              code: it.code || `B${i + 1}`,
              name: it.name,
              description: it.description ?? null,
              quantity: it.quantity ?? 0,
              unit: it.unit ?? null,
              cost_category: it.cost_category,
              cost_rate: it.cost_rate ?? 0,
              selling_rate: it.selling_rate ?? 0,
              cost_amount: c.cost_amount,
              revenue_amount: c.revenue_amount,
              margin_amount: c.margin_amount,
              linked_wbs_code: it.linked_wbs_code ?? null,
              notes: it.notes ?? null,
            };
          }),
        );
      }
    }

    const totals = rollupEstimate(items as any);
    const { data: updated } = await supabaseAdmin
      .from("project_estimates")
      .update({
        notes: parsed.data.notes ?? estimate.notes,
        total_cost: totals.total_cost,
        total_revenue: totals.total_revenue,
        margin_amount: totals.margin_amount,
        margin_pct: totals.margin_pct,
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimate.id)
      .select()
      .single();

    const { data: boq } = await supabaseAdmin
      .from("boq_items")
      .select("*")
      .eq("project_id", id);
    return success({ estimate: updated, boqItems: boq || [] });
  } catch (err) {
    console.error("estimate PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// POST — approve estimate → freeze baseline onto the project (owner/founder).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return error("Unauthorized", 401);
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userData || !["founder", "owner"].includes(userData.role)) {
      return forbidden("Only the owner can approve a budget.");
    }

    const estimate = await latestEstimate(id);
    if (!estimate) return notFound("Estimate not found");

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("project_estimates")
      .update({ status: "approved", approved_by: user.id, approved_at: now, updated_at: now })
      .eq("id", estimate.id);

    // Freeze baseline onto the project.
    await supabaseAdmin
      .from("projects")
      .update({
        approved_budget: estimate.total_cost,
        expected_revenue: estimate.total_revenue,
        expected_margin: estimate.margin_amount,
        forecast_cost: estimate.total_cost,
        forecast_margin: estimate.margin_amount,
        status: "budget_approved",
        updated_at: now,
      })
      .eq("id", id);

    // Seed WBS planned budgets from BOQ cost grouped by linked_wbs_code.
    const { data: boq } = await supabaseAdmin
      .from("boq_items")
      .select("linked_wbs_code, cost_amount")
      .eq("project_id", id);
    const byWbs = new Map<string, number>();
    (boq || []).forEach((b: any) => {
      if (!b.linked_wbs_code) return;
      byWbs.set(b.linked_wbs_code, (byWbs.get(b.linked_wbs_code) || 0) + (Number(b.cost_amount) || 0));
    });
    for (const [code, budget] of byWbs.entries()) {
      await supabaseAdmin
        .from("project_wbs_items")
        .update({ planned_budget: budget })
        .eq("project_id", id)
        .eq("code", code);
    }

    return success({ approved: true });
  } catch (err) {
    console.error("estimate approve error:", err);
    return error("Internal server error", 500);
  }
}
