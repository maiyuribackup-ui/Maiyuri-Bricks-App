export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rejectExpenseSchema } from "@maiyuri/shared";
import { EXPENSE_ADMIN_ROLES } from "@/lib/expenses";
import { notifyExpenseRejected } from "@/lib/expenses-notify";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/expenses/[id]/reject — admin rejects; the amount leaves the
// "spent" sum so the staffer's available balance is restored automatically.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!EXPENSE_ADMIN_ROLES.includes(user.role)) {
      return error("Only founders, owners and accountants can reject", 403);
    }
    const { id } = await params;
    const parsed = await parseBody(request, rejectExpenseSchema);
    if (parsed.error) return parsed.error;

    const { data: claim } = await supabaseAdmin
      .from("expense_claims")
      .select("user_id, amount, status")
      .eq("id", id)
      .single();
    if (!claim) return error("Expense not found", 404);
    if (claim.status !== "pending") {
      return error("This expense is no longer pending", 409);
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("expense_claims")
      .update({
        status: "rejected",
        reject_reason: parsed.data.reason,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();
    if (updErr || !updated) return error("Failed to reject expense", 500);

    void notifyExpenseRejected({
      userId: claim.user_id,
      amount: Number(claim.amount),
      reason: parsed.data.reason,
    });

    return success(updated);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Expenses] reject failed:", err);
    return error("Failed to reject expense", 500);
  }
}
