export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { vehicleRateSchema } from "@maiyuri/shared";
import { EXPENSE_ADMIN_ROLES } from "@/lib/expenses";

// GET /api/expenses/rates — vehicle per-km rates (any authenticated caller).
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { data } = await supabaseAdmin
      .from("expense_vehicle_rates")
      .select("*")
      .order("per_km_rate");
    return success(data ?? []);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    return error("Failed to load vehicle rates", 500);
  }
}

// PUT /api/expenses/rates — admin upsert (id present = update, else insert).
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!EXPENSE_ADMIN_ROLES.includes(user.role)) {
      return error("Not permitted", 403);
    }
    const parsed = await parseBody(request, vehicleRateSchema);
    if (parsed.error) return parsed.error;
    const v = parsed.data;

    if (v.id) {
      const { data, error: e } = await supabaseAdmin
        .from("expense_vehicle_rates")
        .update({
          label: v.label,
          per_km_rate: v.per_km_rate,
          ...(v.active != null ? { active: v.active } : {}),
        })
        .eq("id", v.id)
        .select("*")
        .single();
      if (e) return error("Failed to update rate", 500);
      return success(data);
    }
    const { data, error: e } = await supabaseAdmin
      .from("expense_vehicle_rates")
      .insert({ label: v.label, per_km_rate: v.per_km_rate })
      .select("*")
      .single();
    if (e) return error("Failed to add rate", 500);
    return success(data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    return error("Failed to save vehicle rate", 500);
  }
}
