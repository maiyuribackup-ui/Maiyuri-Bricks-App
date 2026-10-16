export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";
import { computeBudgetVsActual } from "@/lib/projects/compute-budget";
import { buildInsights } from "@/lib/projects/ai/insights";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/insights — AI health summary, risks, recommendations
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { id } = await params;
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();
    if (!project) return notFound("Project not found");

    const [{ data: wbs }, { data: costs }, { data: lastProgress }] = await Promise.all([
      supabaseAdmin.from("project_wbs_items").select("*").eq("project_id", id).order("seq"),
      supabaseAdmin.from("cost_entries").select("amount, wbs_code").eq("project_id", id),
      supabaseAdmin
        .from("daily_progress")
        .select("progress_date")
        .eq("project_id", id)
        .order("progress_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const budget = computeBudgetVsActual({
      approvedBudget: project.approved_budget ?? 0,
      expectedRevenue: project.expected_revenue ?? 0,
      wbs: (wbs || []) as any,
      costs: (costs || []) as any,
    });

    let lastUpdateDaysAgo: number | null = null;
    if (lastProgress?.progress_date) {
      lastUpdateDaysAgo = Math.floor(
        (Date.now() - new Date(lastProgress.progress_date).getTime()) / 86400000,
      );
    }

    const insights = await buildInsights({
      project: project as any,
      wbs: (wbs || []) as any,
      budget,
      lastUpdateDaysAgo,
    });
    return success(insights);
  } catch (err) {
    console.error("insights GET error:", err);
    return error("Internal server error", 500);
  }
}
