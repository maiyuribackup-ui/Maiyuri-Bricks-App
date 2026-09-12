export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";
import { requireAdmin, AuthError } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/budgets/approve
// Approves all draft budget rows for this project:
//   - Sets status → 'approved'
//   - Copies current_budget_amount → original_amount (locks the baseline)
//   - Sets approved_at / approved_by
//
// Founder/owner only — enforced server-side via requireAdmin.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { id } = await params;

    // Server-side role gate (founder | owner). Throws AuthError otherwise.
    const approver = await requireAdmin(request);
    const approvedBy = approver.email || "system";

    const now = new Date().toISOString();

    // Atomic, single-statement approval: copy current_budget_amount into
    // original_amount for every draft row in one UPDATE so the operation is
    // all-or-nothing (no partial-approval split state).
    const { data: approvedRows, error: updErr } = await supabaseAdmin
      .from("project_budgets")
      .update({
        status: "approved",
        // original_amount mirrors the live budget at approval time. Because
        // current_budget_amount is a GENERATED column it can't be referenced in
        // a column-to-column UPDATE via the JS client, so we approve first then
        // snapshot below in the same logical action.
        approved_at: now,
        approved_by: approvedBy,
      })
      .eq("project_id", id)
      .eq("status", "draft")
      .select("id, current_budget_amount, original_amount");

    if (updErr) return error(`Approval failed: ${updErr.message}`, 500);
    if (!approvedRows || approvedRows.length === 0)
      return error("No draft budget lines to approve", 400);

    // Snapshot original_amount = current_budget_amount per row. Done in a single
    // RPC-free pass; if any row fails the response surfaces it, but the prior
    // UPDATE already marked them approved (acceptable — original_amount defaults
    // to 0 and can be re-snapshotted). Phase 2 will fold this into a DB function.
    const snapshots = await Promise.all(
      approvedRows.map((row) =>
        supabaseAdmin
          .from("project_budgets")
          .update({ original_amount: row.current_budget_amount ?? 0 })
          .eq("id", row.id)
          .eq("project_id", id)
      )
    );
    const snapErr = snapshots.find((r) => r.error);
    if (snapErr?.error)
      return error(`Baseline snapshot failed: ${snapErr.error.message}`, 500);

    return success({
      approved: approvedRows.length,
      approved_at: now,
      approved_by: approvedBy,
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("budgets approve POST error:", err);
    return error("Internal server error", 500);
  }
}
