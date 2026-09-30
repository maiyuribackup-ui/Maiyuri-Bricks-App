export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { expenseTypeSchema } from "@maiyuri/shared";
import { EXPENSE_ADMIN_ROLES } from "@/lib/expenses";

// GET /api/expenses/types — expense-type master (any authenticated caller).
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { data } = await supabaseAdmin
      .from("expense_types")
      .select("*")
      .order("sort_order");
    return success(data ?? []);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    return error("Failed to load expense types", 500);
  }
}

// PUT /api/expenses/types — admin upsert (id present = update, else insert).
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!EXPENSE_ADMIN_ROLES.includes(user.role)) {
      return error("Not permitted", 403);
    }
    const parsed = await parseBody(request, expenseTypeSchema);
    if (parsed.error) return parsed.error;
    const t = parsed.data;

    const fields = {
      name: t.name,
      cost_category: t.cost_category,
      ...(t.kind != null ? { kind: t.kind } : {}),
      ...(t.requires_project != null ? { requires_project: t.requires_project } : {}),
      ...(t.icon !== undefined ? { icon: t.icon } : {}),
      ...(t.sort_order != null ? { sort_order: t.sort_order } : {}),
      ...(t.active != null ? { active: t.active } : {}),
    };

    if (t.id) {
      const { data, error: e } = await supabaseAdmin
        .from("expense_types")
        .update(fields)
        .eq("id", t.id)
        .select("*")
        .single();
      if (e) return error("Failed to update type", 500);
      return success(data);
    }
    const { data, error: e } = await supabaseAdmin
      .from("expense_types")
      .insert(fields)
      .select("*")
      .single();
    if (e) return error("Failed to add type", 500);
    return success(data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    return error("Failed to save expense type", 500);
  }
}
