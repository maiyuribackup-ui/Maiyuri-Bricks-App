export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { updateOcActivityRateSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH /api/ops-control/masters/activity-rates/[id]
//
// Closing a period (setting effective_to) or deactivating a rate is allowed.
// Editing the RATE VALUE of a period that has already been used is not
// prevented here, but it is audited with the before value — PRD §67 requires
// that a change affecting an approved labour settlement is visible, and Phase 6
// will refuse it outright once settlements exist.
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateOcActivityRateSchema);
    if (parsed.error) return parsed.error;

    const { data: before } = await supabaseAdmin
      .from("oc_activity_rates")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!before) return notFound("Activity rate");

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_activity_rates")
      .update({ ...parsed.data, modified_by: auth.user.id })
      .eq("id", id)
      .select("*")
      .single();

    if (dbError) {
      if (dbError.code === "23P01") {
        return error(
          "That period would overlap an existing rate for the same product and activity.",
          409,
        );
      }
      return error(`Failed to update rate: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_activity_rates",
      entity_id: id,
      action: parsed.data.active === false ? "deactivated" : "updated",
      before_value: before,
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] activity-rates PATCH failed:", err);
    return error("Failed to update activity rate", 500);
  }
}
