export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { updateProjectSchema } from "@maiyuri/shared";
import { computeBudgetVsActual } from "@/lib/projects/compute-budget";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] — full project bundle for the detail page
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { data: project, error: pErr } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();
    if (pErr || !project) return notFound("Project not found");

    const [{ data: estimate }, { data: boq }, { data: wbs }, { data: costs }] =
      await Promise.all([
        supabaseAdmin
          .from("project_estimates")
          .select("*")
          .eq("project_id", id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin.from("boq_items").select("*").eq("project_id", id),
        supabaseAdmin
          .from("project_wbs_items")
          .select("*")
          .eq("project_id", id)
          .order("seq", { ascending: true }),
        supabaseAdmin.from("cost_entries").select("amount").eq("project_id", id),
      ]);

    const budget = computeBudgetVsActual({
      approvedBudget: project.approved_budget ?? 0,
      expectedRevenue: project.expected_revenue ?? 0,
      wbs: (wbs || []) as any,
      costs: (costs || []) as any,
    });

    return success({
      project,
      estimate: estimate ?? null,
      boqItems: boq || [],
      wbsItems: wbs || [],
      budget,
    });
  } catch (err) {
    console.error("project GET error:", err);
    return error("Internal server error", 500);
  }
}

// PATCH /api/projects/[id] — update editable project header fields
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateProjectSchema);
    if (parsed.error) return parsed.error;

    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updateData[k] = v;
    }
    updateData.updated_at = new Date().toISOString();

    const { data: project, error: dbErr } = await supabaseAdmin
      .from("projects")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (dbErr) {
      if (dbErr.code === "PGRST116") return notFound("Project not found");
      return error(`Failed to update project: ${dbErr.message}`, 500);
    }
    return success(project);
  } catch (err) {
    console.error("project PATCH error:", err);
    return error("Internal server error", 500);
  }
}
