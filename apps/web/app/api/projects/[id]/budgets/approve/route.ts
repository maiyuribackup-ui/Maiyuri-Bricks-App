export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/budgets/approve
// Approves all draft budget rows for this project:
//   - Sets status → 'approved'
//   - Copies current_budget_amount → original_amount (locks the baseline)
//   - Sets approved_at / approved_by
//
// Intended for founders/owners only (enforced at UI layer for Phase 1;
// Phase 2 will add role-based enforcement here).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Read requester identity from header set by the Next.js middleware
    // (or fall back to "system" if not present).
    const approvedBy =
      request.headers.get("x-user-email") ?? "system";

    // Fetch all draft rows to capture their current_budget_amount
    const { data: draftRows, error: fetchErr } = await supabaseAdmin
      .from("project_budgets")
      .select("id, current_budget_amount")
      .eq("project_id", id)
      .eq("status", "draft");

    if (fetchErr) return error("Failed to fetch draft budgets", 500);
    if (!draftRows || draftRows.length === 0)
      return error("No draft budget lines to approve", 400);

    const now = new Date().toISOString();

    // Approve each row, snapshotting original_amount
    const updates = draftRows.map((row) =>
      supabaseAdmin
        .from("project_budgets")
        .update({
          status: "approved",
          original_amount: row.current_budget_amount ?? 0,
          approved_at: now,
          approved_by: approvedBy,
        })
        .eq("id", row.id)
    );

    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error)
      return error(`Approval failed: ${firstErr.error.message}`, 500);

    return success({
      approved: draftRows.length,
      approved_at: now,
      approved_by: approvedBy,
    });
  } catch (err) {
    console.error("budgets approve POST error:", err);
    return error("Internal server error", 500);
  }
}
