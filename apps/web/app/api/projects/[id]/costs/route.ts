export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { createCostEntrySchema } from "@maiyuri/shared";
import { recomputeProject } from "@/lib/projects/recompute";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { data, error: dbErr } = await supabaseAdmin
      .from("cost_entries")
      .select("*, cbs:cbs_master(id, cbs_code, category, work_item, cost_type)")
      .eq("project_id", id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (dbErr) return error("Failed to load costs", 500);
    return success(data || []);
  } catch {
    return error("Internal server error", 500);
  }
}

// POST — record a cost entry, then recompute the project budget-vs-actual.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createCostEntrySchema);
    if (parsed.error) return parsed.error;
    const c = parsed.data;

    // Compute amount from qty×rate when amount not given.
    const amount =
      c.amount != null
        ? c.amount
        : (Number(c.quantity) || 0) * (Number(c.rate) || 0);

    const { data: entry, error: insErr } = await supabaseAdmin
      .from("cost_entries")
      .insert({
        project_id: id,
        wbs_code: c.wbs_code ?? null,
        entry_date: c.entry_date || new Date().toISOString().slice(0, 10),
        cost_category: c.cost_category,
        description: c.description ?? null,
        quantity: c.quantity ?? null,
        unit: c.unit ?? null,
        rate: c.rate ?? null,
        amount,
        vendor: c.vendor ?? null,
        payment_status: c.payment_status,
        bill_number: c.bill_number ?? null,
        attachment_url: c.attachment_url ?? null,
        source: "manual",
      })
      .select()
      .single();
    if (insErr) return error(`Failed to save cost: ${insErr.message}`, 500);

    await recomputeProject(id);
    return success(entry);
  } catch (err) {
    console.error("costs POST error:", err);
    return error("Internal server error", 500);
  }
}

const patchCostSchema = z.object({
  id: z.string().uuid(),
  approval_status: z.enum(["pending", "approved", "rejected"]).optional(),
  cbs_id: z.string().uuid().nullable().optional(),
  zone: z.string().nullable().optional(),
});

// PATCH — update approval_status or CBS assignment on a cost entry.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, patchCostSchema);
    if (parsed.error) return parsed.error;
    const { id: costId, ...updates } = parsed.data;

    const patch: Record<string, unknown> = {};
    if (updates.approval_status !== undefined) patch.approval_status = updates.approval_status;
    if (updates.cbs_id !== undefined) patch.cbs_id = updates.cbs_id;
    if (updates.zone !== undefined) patch.zone = updates.zone;

    const { data: row, error: updErr } = await supabaseAdmin
      .from("cost_entries")
      .update(patch)
      .eq("id", costId)
      .eq("project_id", id)
      .select()
      .single();

    if (updErr) return error(`Failed to update cost: ${updErr.message}`, 500);
    return success(row);
  } catch (err) {
    console.error("costs PATCH error:", err);
    return error("Internal server error", 500);
  }
}
