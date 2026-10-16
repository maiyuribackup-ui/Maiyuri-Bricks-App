export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { approveExpenseSchema } from "@maiyuri/shared";
import { EXPENSE_ADMIN_ROLES, postClaimToProjectCost } from "@/lib/expenses";
import { notifyExpenseApproved } from "@/lib/expenses-notify";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/expenses/[id]/approve — admin approves a pending claim.
// (Balance was already deducted on submit; approval posts to project costs.)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!EXPENSE_ADMIN_ROLES.includes(user.role)) {
      return error("Only founders, owners and accountants can approve", 403);
    }
    const { id } = await params;
    const parsed = await parseBody(request, approveExpenseSchema);
    if (parsed.error) return parsed.error;

    // Load the claim + its type's cost_category for the project-cost post.
    const { data: claim } = await supabaseAdmin
      .from("expense_claims")
      .select("*, expense_type:expense_types(cost_category)")
      .eq("id", id)
      .single();
    if (!claim) return error("Expense not found", 404);
    if (claim.status !== "pending") {
      return error("This expense is no longer pending", 409);
    }

    // Post to project costing (best-effort; never blocks approval).
    const costEntryId = await postClaimToProjectCost({
      id: claim.id,
      project_id: claim.project_id,
      amount: Number(claim.amount),
      description: claim.description,
      expense_date: claim.expense_date,
      receipt_url: claim.receipt_url,
      cost_category:
        (claim.expense_type as { cost_category?: string } | null)?.cost_category ??
        "miscellaneous",
      vendor_name: claim.customer_name,
    });

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("expense_claims")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        cost_entry_id: costEntryId,
      })
      .eq("id", id)
      .eq("status", "pending") // optimistic guard against a concurrent decision
      .select("*")
      .single();
    if (updErr || !updated) return error("Failed to approve expense", 500);

    void notifyExpenseApproved({
      userId: claim.user_id,
      amount: Number(claim.amount),
    });

    return success(updated);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Expenses] approve failed:", err);
    return error("Failed to approve expense", 500);
  }
}
