/**
 * Reimbursement / Petty Cash — server helpers.
 *
 * Balance is ALWAYS computed, never stored:
 *   balance(user) = Σ topups.amount − Σ claims.amount WHERE status IN (pending, approved)
 * A pending claim already reduces the available balance (overspend guard);
 * a rejected claim is excluded, so rejecting restores the money.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recomputeProject } from "@/lib/projects/recompute";
import type { ExpenseBalance } from "@maiyuri/shared";

export const EXPENSE_SUBMITTER_ROLES = [
  "engineer",
  "driver",
  "sales",
  "production_supervisor",
];
export const EXPENSE_ADMIN_ROLES = ["founder", "owner", "accountant"];

// Private Supabase Storage bucket for receipt uploads. Lives here (not in the
// route) because a route.ts may only export Next.js route fields — exporting
// any other const from it fails the production build.
export const EXPENSE_RECEIPT_BUCKET = "expense-receipts";

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number(v) || 0;

/** One staffer's live balance. */
export async function getBalance(userId: string): Promise<{
  balance: number;
  topups_total: number;
  spent_total: number;
}> {
  const [topupsRes, claimsRes] = await Promise.all([
    supabaseAdmin.from("petty_cash_topups").select("amount").eq("user_id", userId),
    supabaseAdmin
      .from("expense_claims")
      .select("amount")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"]),
  ]);
  const topups_total = (topupsRes.data ?? []).reduce((s, r) => s + num(r.amount), 0);
  const spent_total = (claimsRes.data ?? []).reduce((s, r) => s + num(r.amount), 0);
  return {
    topups_total,
    spent_total,
    balance: topups_total - spent_total,
  };
}

/** Balances for every submitter-role staffer (admin all-staff view). */
export async function getAllBalances(): Promise<ExpenseBalance[]> {
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, name, role, is_active")
    .eq("is_active", true)
    .in("role", EXPENSE_SUBMITTER_ROLES);

  const ids = (users ?? []).map((u) => u.id);
  if (!ids.length) return [];

  const [topupsRes, claimsRes] = await Promise.all([
    supabaseAdmin.from("petty_cash_topups").select("user_id, amount").in("user_id", ids),
    supabaseAdmin
      .from("expense_claims")
      .select("user_id, amount, status")
      .in("user_id", ids)
      .in("status", ["pending", "approved"]),
  ]);

  const topupByUser = new Map<string, number>();
  for (const t of topupsRes.data ?? []) {
    topupByUser.set(t.user_id, (topupByUser.get(t.user_id) ?? 0) + num(t.amount));
  }
  const spentByUser = new Map<string, number>();
  const pendingByUser = new Map<string, number>();
  for (const c of claimsRes.data ?? []) {
    spentByUser.set(c.user_id, (spentByUser.get(c.user_id) ?? 0) + num(c.amount));
    if (c.status === "pending") {
      pendingByUser.set(c.user_id, (pendingByUser.get(c.user_id) ?? 0) + 1);
    }
  }

  return (users ?? [])
    .map((u) => {
      const topups_total = topupByUser.get(u.id) ?? 0;
      const spent_total = spentByUser.get(u.id) ?? 0;
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        topups_total,
        spent_total,
        balance: topups_total - spent_total,
        pending_count: pendingByUser.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => b.pending_count - a.pending_count || b.balance - a.balance);
}

/**
 * On approval of a PROJECT-linked claim, post it into the project cost ledger
 * so actuals/variance reflect field spend. Best-effort: a failure here must
 * never block the approval (mirrors the deliveries trip-cost write). Returns
 * the created cost_entry id, or null.
 */
export async function postClaimToProjectCost(claim: {
  id: string;
  project_id: string | null;
  amount: number;
  description: string | null;
  expense_date: string;
  receipt_url: string | null;
  cost_category: string;
  vendor_name: string | null;
}): Promise<string | null> {
  if (!claim.project_id) return null;
  try {
    const { data: entry, error: insErr } = await supabaseAdmin
      .from("cost_entries")
      .insert({
        project_id: claim.project_id,
        entry_date: claim.expense_date,
        cost_category: claim.cost_category,
        description:
          `Reimbursement: ${claim.description ?? "field expense"}`.slice(0, 500),
        amount: claim.amount,
        vendor: claim.vendor_name,
        payment_status: "paid", // the staffer already paid out of the float
        attachment_url: claim.receipt_url,
        source: "manual", // CHECK allows manual|telegram|ai only
        approval_status: "approved",
      })
      .select("id")
      .single();
    if (insErr || !entry) {
      console.error("[Expenses] cost post failed:", insErr);
      return null;
    }
    await recomputeProject(claim.project_id);
    return entry.id;
  } catch (err) {
    console.error("[Expenses] cost post threw:", err);
    return null;
  }
}
