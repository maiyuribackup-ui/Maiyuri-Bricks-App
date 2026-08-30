export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, created, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { PRODUCTION_ROLES, loadProductionDay } from "@/lib/ops-control/production";
import { operationalToday } from "@/lib/ops-control/inventory-service";
import { createOcProductionDaySchema } from "@maiyuri/shared";

/**
 * GET /api/ops-control/production/days[?date=YYYY-MM-DD]
 *
 * With a date: the whole day — shifts, plan lines, allocations, actuals,
 * assignments and cement — in one read, because the screen runs on a phone
 * in the yard and six round trips over a patchy connection is not a design.
 * Without: the recent days, for the picker.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { date } = parseQuery(request);
    if (date) {
      const day = await loadProductionDay(date);
      return success({ date, day });
    }
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_days")
      .select("*")
      .order("prod_date", { ascending: false })
      .limit(60);
    if (dbError) return error("Failed to load production days", 500);
    return success({ today: operationalToday(), days: data ?? [] });
  } catch (err) {
    console.error("[OpsControl] production days GET failed:", err);
    return error("Failed to load production days", 500);
  }
}

/** POST — open a production day, and its shifts with it. */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcProductionDaySchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_days")
      .insert({
        prod_date: input.prod_date,
        planned_shift_count: input.planned_shift_count,
        notes: input.notes ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) {
      if (dbError.code === "23505") {
        return error(`A production day already exists for ${input.prod_date}`, 409);
      }
      return error(`Failed to create production day: ${dbError.message}`, 400);
    }

    // Shifts are created with the day: "we ran one shift on Tuesday" should
    // be a fact recorded against a row, not inferred from a missing one.
    const dayId = (data as { id: string }).id;
    const shifts = Array.from({ length: input.planned_shift_count }, (_, i) => ({
      day_id: dayId,
      shift_no: i + 1,
    }));
    const { error: shiftError } = await supabaseAdmin
      .from("oc_production_shifts")
      .insert(shifts);
    if (shiftError) return error(`Failed to create shifts: ${shiftError.message}`, 400);

    await logOcAudit({
      entity: "oc_production_days",
      entity_id: dayId,
      action: "created",
      after_value: input,
      performed_by: auth.user.id,
    });
    return created(await loadProductionDay(input.prod_date));
  } catch (err) {
    console.error("[OpsControl] production days POST failed:", err);
    return error("Failed to create production day", 500);
  }
}
