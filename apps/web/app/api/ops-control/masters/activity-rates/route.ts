export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { createOcActivityRateSchema } from "@maiyuri/shared";

const SELECT = "*, finished_goods(id, name)";

// GET /api/ops-control/masters/activity-rates?finished_good_id&activity_code&active
export async function GET(request: NextRequest) {
  try {
    const { finished_good_id, activity_code, active } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_activity_rates")
      .select(SELECT)
      .order("finished_good_id")
      .order("activity_code")
      .order("effective_from", { ascending: false });

    if (finished_good_id) query = query.eq("finished_good_id", finished_good_id);
    if (activity_code) query = query.eq("activity_code", activity_code);
    if (active === "true") query = query.eq("active", true);

    const { data, error: dbError } = await query.limit(500);
    if (dbError) return error("Failed to load activity rates", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] activity-rates GET failed:", err);
    return error("Failed to load activity rates", 500);
  }
}

// POST /api/ops-control/masters/activity-rates
//
// Rates are effective-dated and never edited in place: to change a rate you
// close the current period and open a new one, so August keeps paying the
// August rate (PRD §60). Overlapping periods are rejected by a database
// EXCLUDE constraint — a data-integrity failure, so it blocks (PRD §88).
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcActivityRateSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_activity_rates")
      .insert({
        ...parsed.data,
        effective_to: parsed.data.effective_to ?? null,
        created_by: auth.user.id,
        modified_by: auth.user.id,
      })
      .select(SELECT)
      .single();

    if (dbError) {
      // 23P01 = exclusion_violation: the new period overlaps an existing one.
      if (dbError.code === "23P01") {
        return error(
          "This rate period overlaps an existing rate for the same product and activity. Close the current period first.",
          409,
        );
      }
      return error(`Failed to create rate: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_activity_rates",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] activity-rates POST failed:", err);
    return error("Failed to create activity rate", 500);
  }
}
