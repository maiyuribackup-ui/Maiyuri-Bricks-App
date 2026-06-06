export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, created, error, parseBody } from "@/lib/api-utils";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createBudgetSchema = z.object({
  cbs_id: z.string().uuid("cbs_id must be a UUID"),
  zone: z.string().optional().nullable(),
  quantity: z.number().min(0),
  rate: z.number().min(0),
  unit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/projects/[id]/budgets
// Returns all budget rows for the project, joined with cbs_master.
// Also returns aggregate totals.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data, error: dbErr } = await supabaseAdmin
      .from("project_budgets")
      .select(`
        *,
        cbs:cbs_master(*)
      `)
      .eq("project_id", id)
      .order("cbs_id", { ascending: true });

    if (dbErr) return error("Failed to load budgets", 500);

    const items = data || [];
    const totals = items.reduce(
      (acc, row) => ({
        base: acc.base + (row.base_budget_amount ?? 0),
        revision: acc.revision + (row.revision_amount_total ?? 0),
        current: acc.current + (row.current_budget_amount ?? 0),
        original: acc.original + (row.original_amount ?? 0),
      }),
      { base: 0, revision: 0, current: 0, original: 0 }
    );

    return success({ items, totals });
  } catch {
    return error("Internal server error", 500);
  }
}

// POST /api/projects/[id]/budgets
// Adds a new CBS budget line for this project.
// Allowed at any time (draft rows can be freely added).
// Once the budget is approved, direct edits are blocked (use revision — Phase 3).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createBudgetSchema);
    if (parsed.error) return parsed.error;
    const b = parsed.data;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("project_budgets")
      .insert({
        project_id: id,
        cbs_id: b.cbs_id,
        zone: b.zone ?? null,
        quantity: b.quantity,
        rate: b.rate,
        unit: b.unit ?? null,
        notes: b.notes ?? null,
        original_amount: 0, // will be set on approve
        revision_amount_total: 0,
        revision_no: 0,
        status: "draft",
      })
      .select(`*, cbs:cbs_master(*)`)
      .single();

    if (insErr) return error(`Failed to create budget: ${insErr.message}`, 500);
    return created(row);
  } catch (err) {
    console.error("budgets POST error:", err);
    return error("Internal server error", 500);
  }
}
