export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { createDailyProgressSchema } from "@maiyuri/shared";
import { recomputeProject } from "@/lib/projects/recompute";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { data, error: dbErr } = await supabaseAdmin
      .from("daily_progress")
      .select("*")
      .eq("project_id", id)
      .order("progress_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (dbErr) return error("Failed to load progress", 500);
    return success(data || []);
  } catch {
    return error("Internal server error", 500);
  }
}

// POST — log a daily update; bump the linked WBS completed quantity/progress
// and recompute the project roll-ups.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createDailyProgressSchema);
    if (parsed.error) return parsed.error;
    const d = parsed.data;

    const { data: entry, error: insErr } = await supabaseAdmin
      .from("daily_progress")
      .insert({
        project_id: id,
        wbs_code: d.wbs_code ?? null,
        progress_date: d.progress_date || new Date().toISOString().slice(0, 10),
        planned_quantity: d.planned_quantity ?? null,
        actual_quantity: d.actual_quantity ?? null,
        unit: d.unit ?? null,
        labour_count: d.labour_count ?? null,
        labour_hours: d.labour_hours ?? null,
        machine_hours: d.machine_hours ?? null,
        material_used: d.material_used ?? null,
        cost_mentioned: d.cost_mentioned ?? null,
        issue: d.issue ?? null,
        delay_reason: d.delay_reason ?? null,
        tomorrow_plan: d.tomorrow_plan ?? null,
        photos: d.photos ?? [],
        supervisor_notes: d.supervisor_notes ?? null,
        source: "app",
      })
      .select()
      .single();
    if (insErr) return error(`Failed to save progress: ${insErr.message}`, 500);

    // Advance the linked WBS item's completed quantity + progress.
    if (d.wbs_code && typeof d.actual_quantity === "number" && d.actual_quantity > 0) {
      const { data: wbs } = await supabaseAdmin
        .from("project_wbs_items")
        .select("id, completed_quantity, planned_quantity")
        .eq("project_id", id)
        .eq("code", d.wbs_code)
        .maybeSingle();
      if (wbs) {
        const completed = (Number(wbs.completed_quantity) || 0) + d.actual_quantity;
        const planned = Number(wbs.planned_quantity) || 0;
        const update: Record<string, unknown> = { completed_quantity: completed, status: "in_progress" };
        if (planned > 0) {
          const pct = Math.min(100, Math.round((completed / planned) * 100));
          update.progress_pct = pct;
          if (pct >= 100) update.status = "completed";
        }
        await supabaseAdmin.from("project_wbs_items").update(update).eq("id", wbs.id);
      }
    }

    await recomputeProject(id);
    return success(entry);
  } catch (err) {
    console.error("progress POST error:", err);
    return error("Internal server error", 500);
  }
}
