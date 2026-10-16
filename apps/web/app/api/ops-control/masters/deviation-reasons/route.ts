export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { createOcDeviationReasonSchema } from "@maiyuri/shared";

// GET /api/ops-control/masters/deviation-reasons?scope=production|delivery
// Scoped so the production and delivery pickers never show each other's
// reasons (PRD §29, §55).
export async function GET(request: NextRequest) {
  try {
    const { scope, active } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_deviation_reasons")
      .select("*")
      .order("scope")
      .order("sort_order");

    if (scope) query = query.eq("scope", scope);
    if (active !== "false") query = query.eq("active", true);

    const { data, error: dbError } = await query;
    if (dbError) return error("Failed to load deviation reasons", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] deviation-reasons GET failed:", err);
    return error("Failed to load deviation reasons", 500);
  }
}

// POST /api/ops-control/masters/deviation-reasons
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcDeviationReasonSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_deviation_reasons")
      .insert(parsed.data)
      .select("*")
      .single();

    if (dbError) {
      if (dbError.code === "23505") {
        return error("That reason code already exists for this scope", 409);
      }
      return error(`Failed to create reason: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_deviation_reasons",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] deviation-reasons POST failed:", err);
    return error("Failed to create deviation reason", 500);
  }
}
