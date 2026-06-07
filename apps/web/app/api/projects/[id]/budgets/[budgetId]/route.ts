export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string; budgetId: string }>;
}

const updateBudgetSchema = z.object({
  zone: z.string().optional().nullable(),
  quantity: z.number().min(0).optional(),
  rate: z.number().min(0).optional(),
  unit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// PATCH /api/projects/[id]/budgets/[budgetId]
// Updates a draft budget row.
// Rejects with 409 if the row is already approved — Phase 3 will introduce revision flow.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, budgetId } = await params;

    // Fetch current row to check status — scope by BOTH project_id and id so a
    // budget UUID cannot be reached through the wrong project route.
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("project_budgets")
      .select("id, status")
      .eq("id", budgetId)
      .eq("project_id", id)
      .single();

    if (fetchErr || !existing)
      return error("Budget row not found", 404);

    if (existing.status === "approved")
      return error(
        "This budget line is approved and cannot be edited directly. Use a revision (Phase 3).",
        409
      );

    const parsed = await parseBody(request, updateBudgetSchema);
    if (parsed.error) return parsed.error;
    const updates = parsed.data;

    // Strip undefined values — only patch provided fields
    const patch: Record<string, unknown> = {};
    if (updates.zone !== undefined) patch.zone = updates.zone;
    if (updates.quantity !== undefined) patch.quantity = updates.quantity;
    if (updates.rate !== undefined) patch.rate = updates.rate;
    if (updates.unit !== undefined) patch.unit = updates.unit;
    if (updates.notes !== undefined) patch.notes = updates.notes;

    const { data: row, error: updErr } = await supabaseAdmin
      .from("project_budgets")
      .update(patch)
      .eq("id", budgetId)
      .eq("project_id", id)
      .select(`*, cbs:cbs_master(*)`)
      .single();

    if (updErr) return error(`Failed to update budget: ${updErr.message}`, 500);
    return success(row);
  } catch (err) {
    console.error("budget PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/projects/[id]/budgets/[budgetId]
// Deletes a draft budget row. Approved rows cannot be deleted.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, budgetId } = await params;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("project_budgets")
      .select("id, status")
      .eq("id", budgetId)
      .eq("project_id", id)
      .single();

    if (fetchErr || !existing)
      return error("Budget row not found", 404);

    if (existing.status === "approved")
      return error("Cannot delete an approved budget line.", 409);

    const { error: delErr } = await supabaseAdmin
      .from("project_budgets")
      .delete()
      .eq("id", budgetId)
      .eq("project_id", id);

    if (delErr) return error(`Failed to delete budget: ${delErr.message}`, 500);
    return success({ deleted: budgetId });
  } catch (err) {
    console.error("budget DELETE error:", err);
    return error("Internal server error", 500);
  }
}
