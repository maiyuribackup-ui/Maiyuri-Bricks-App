export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { createOcConsumptionStandardSchema } from "@maiyuri/shared";

const SELECT = "*, finished_goods(id, name)";

// GET /api/ops-control/masters/consumption-standards?finished_good_id&active
export async function GET(request: NextRequest) {
  try {
    const { finished_good_id, active } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_consumption_standards")
      .select(SELECT)
      .order("finished_good_id")
      .order("effective_from", { ascending: false });

    if (finished_good_id) query = query.eq("finished_good_id", finished_good_id);
    if (active === "true") query = query.eq("active", true);

    const { data, error: dbError } = await query.limit(500);
    if (dbError) return error("Failed to load consumption standards", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] consumption-standards GET failed:", err);
    return error("Failed to load consumption standards", 500);
  }
}

// POST /api/ops-control/masters/consumption-standards
//
// standard_yield is "bricks produced per 50 kg bag" (PRD §34). Effective-dated
// so an August production record always evaluates against August's recipe even
// after the mix changes in September (AC-C06).
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcConsumptionStandardSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_consumption_standards")
      .insert({
        ...parsed.data,
        effective_to: parsed.data.effective_to ?? null,
        tolerance_pct: parsed.data.tolerance_pct ?? null,
        created_by: auth.user.id,
        modified_by: auth.user.id,
      })
      .select(SELECT)
      .single();

    if (dbError) {
      if (dbError.code === "23P01") {
        return error(
          "This period overlaps an existing standard for the same product and material. Close the current period first.",
          409,
        );
      }
      return error(`Failed to create standard: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_consumption_standards",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] consumption-standards POST failed:", err);
    return error("Failed to create consumption standard", 500);
  }
}
