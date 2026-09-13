export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { topupSchema } from "@maiyuri/shared";
import { EXPENSE_ADMIN_ROLES } from "@/lib/expenses";
import { notifyTopup } from "@/lib/expenses-notify";

// POST /api/expenses/topups — admin credits a staffer's petty-cash float.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!EXPENSE_ADMIN_ROLES.includes(user.role)) {
      return error("Only founders, owners and accountants can add top-ups", 403);
    }
    const parsed = await parseBody(request, topupSchema);
    if (parsed.error) return parsed.error;

    const { data: topup, error: insErr } = await supabaseAdmin
      .from("petty_cash_topups")
      .insert({
        user_id: parsed.data.user_id,
        amount: parsed.data.amount,
        note: parsed.data.note ?? null,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (insErr || !topup) {
      console.error("[Expenses] topup failed:", insErr);
      return error("Failed to add top-up", 500);
    }

    void notifyTopup({ userId: parsed.data.user_id, amount: parsed.data.amount });
    return success(topup);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Expenses] topup error:", err);
    return error("Failed to add top-up", 500);
  }
}
