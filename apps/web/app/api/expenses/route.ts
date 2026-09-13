export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createExpenseSchema } from "@maiyuri/shared";
import type {
  AllExpensesResponse,
  ExpenseClaim,
  MyExpensesResponse,
} from "@maiyuri/shared";
import {
  EXPENSE_ADMIN_ROLES,
  EXPENSE_SUBMITTER_ROLES,
  getAllBalances,
  getBalance,
} from "@/lib/expenses";
import { notifyExpenseSubmitted } from "@/lib/expenses-notify";

const CLAIM_SELECT =
  "*, expense_type:expense_types(id, name, kind, icon), project:projects(id, name), user:users!expense_claims_user_id_fkey(id, name)";

// GET /api/expenses           → my balance + my claims/topups + masters
// GET /api/expenses?view=all  → admin: all balances + pending queue
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const isAdmin = EXPENSE_ADMIN_ROLES.includes(user.role);
    const view = new URL(request.url).searchParams.get("view");

    if (view === "all") {
      if (!isAdmin) return error("Not permitted", 403);
      const [balances, pendingRes] = await Promise.all([
        getAllBalances(),
        supabaseAdmin
          .from("expense_claims")
          .select(CLAIM_SELECT)
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
      ]);
      return success<AllExpensesResponse>({
        balances,
        pending: (pendingRes.data ?? []) as ExpenseClaim[],
      });
    }

    // Own view
    const [bal, claimsRes, topupsRes, typesRes, ratesRes] = await Promise.all([
      getBalance(user.id),
      supabaseAdmin
        .from("expense_claims")
        .select(CLAIM_SELECT)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("petty_cash_topups")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("expense_types")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
      supabaseAdmin
        .from("expense_vehicle_rates")
        .select("*")
        .eq("active", true)
        .order("per_km_rate"),
    ]);

    return success<MyExpensesResponse>({
      balance: bal.balance,
      topups_total: bal.topups_total,
      spent_total: bal.spent_total,
      claims: (claimsRes.data ?? []) as ExpenseClaim[],
      topups: topupsRes.data ?? [],
      types: typesRes.data ?? [],
      vehicleRates: ratesRes.data ?? [],
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Expenses] GET failed:", err);
    return error("Failed to load expenses", 500);
  }
}

// POST /api/expenses — submit a claim (deducts from available balance now)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (
      !EXPENSE_SUBMITTER_ROLES.includes(user.role) &&
      !EXPENSE_ADMIN_ROLES.includes(user.role)
    ) {
      return error("Your role cannot record expenses", 403);
    }

    const parsed = await parseBody(request, createExpenseSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: type } = await supabaseAdmin
      .from("expense_types")
      .select("id, name, kind, requires_project, active")
      .eq("id", input.expense_type_id)
      .single();
    if (!type || !type.active) return error("Invalid expense type", 400);
    if (type.requires_project && !input.project_id) {
      return error("This expense type requires a project", 400);
    }

    // Resolve the amount. For petrol, ALWAYS compute server-side from the
    // chosen vehicle rate × km — the client's number is never trusted.
    let amount: number;
    let perKmApplied: number | null = null;
    if (type.kind === "petrol") {
      if (!input.vehicle_rate_id || !input.km || input.km <= 0) {
        return error("Petrol expense needs a vehicle and kilometres", 400);
      }
      const { data: rate } = await supabaseAdmin
        .from("expense_vehicle_rates")
        .select("per_km_rate, active")
        .eq("id", input.vehicle_rate_id)
        .single();
      if (!rate || !rate.active) return error("Invalid vehicle rate", 400);
      perKmApplied = Number(rate.per_km_rate);
      amount = Math.round(perKmApplied * input.km * 100) / 100;
    } else {
      if (input.amount == null || input.amount < 0) {
        return error("Amount is required", 400);
      }
      amount = input.amount;
    }

    // Overspend guard: available balance must cover this claim.
    const bal = await getBalance(user.id);
    if (amount > bal.balance) {
      return error(
        `Amount ₹${Math.round(amount)} exceeds your available balance ₹${Math.round(bal.balance)}`,
        400,
      );
    }

    const { data: claim, error: insErr } = await supabaseAdmin
      .from("expense_claims")
      .insert({
        user_id: user.id,
        expense_type_id: input.expense_type_id,
        project_id: input.project_id ?? null,
        amount,
        description: input.description ?? null,
        expense_date: input.expense_date || new Date().toISOString().slice(0, 10),
        receipt_url: input.receipt_url ?? null,
        status: "pending",
        vehicle_rate_id: input.vehicle_rate_id ?? null,
        lead_id: input.lead_id ?? null,
        customer_name: input.customer_name ?? null,
        from_location: input.from_location ?? null,
        to_location: input.to_location ?? null,
        km: input.km ?? null,
        per_km_rate_applied: perKmApplied,
      })
      .select(CLAIM_SELECT)
      .single();
    if (insErr || !claim) {
      console.error("[Expenses] insert failed:", insErr);
      return error("Failed to save expense", 500);
    }

    void notifyExpenseSubmitted({
      submitterName: user.email,
      amount,
      typeName: type.name,
    });

    return success<ExpenseClaim>(claim as ExpenseClaim);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Expenses] POST failed:", err);
    return error("Failed to save expense", 500);
  }
}
