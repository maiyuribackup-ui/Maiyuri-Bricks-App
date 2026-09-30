export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";
import { updateWbsItemSchema } from "@maiyuri/shared";
import { recomputeProject } from "@/lib/projects/recompute";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { id } = await params;
    const { data, error: dbErr } = await supabaseAdmin
      .from("project_wbs_items")
      .select("*")
      .eq("project_id", id)
      .order("seq", { ascending: true });
    if (dbErr) return error("Failed to load WBS", 500);
    return success(data || []);
  } catch {
    return error("Internal server error", 500);
  }
}

// PATCH — update one WBS item ({ wbs_id, ...fields }); auto-derive progress
// from completed/planned quantity when both are present (quantity-based %).
const patchSchema = updateWbsItemSchema.extend({ wbs_id: z.string().uuid() });

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { id } = await params;
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;
    const { wbs_id, ...fields } = parsed.data;

    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updateData[k] = v;
    }

    // Quantity-based progress (overrides manual unless none provided)
    const planned = updateData.planned_quantity as number | undefined;
    const completed = updateData.completed_quantity as number | undefined;
    if (
      typeof completed === "number" &&
      typeof planned === "number" &&
      planned > 0 &&
      updateData.progress_pct === undefined
    ) {
      updateData.progress_pct = Math.min(100, Math.round((completed / planned) * 100));
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error: dbErr } = await supabaseAdmin
      .from("project_wbs_items")
      .update(updateData)
      .eq("id", wbs_id)
      .eq("project_id", id)
      .select()
      .single();
    if (dbErr) return error(`Failed to update WBS: ${dbErr.message}`, 500);
    // Re-roll project progress/forecast/health so the list view stays fresh.
    await recomputeProject(id);
    return success(data);
  } catch {
    return error("Internal server error", 500);
  }
}
