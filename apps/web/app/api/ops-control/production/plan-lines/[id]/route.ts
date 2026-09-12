export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { updateOcPlanLineSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateOcPlanLineSchema);
    if (parsed.error) return parsed.error;
    const { lock_version, planned_qty } = parsed.data;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_plan_lines")
      .update({ planned_qty, lock_version: lock_version + 1 })
      .eq("id", id)
      .eq("lock_version", lock_version)
      .select("*")
      .maybeSingle();
    if (dbError) return error(`Failed to update plan line: ${dbError.message}`, 400);
    if (!data) {
      return error("This plan line changed since you loaded it — reload and try again", 409);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] plan-line PATCH failed:", err);
    return error("Failed to update plan line", 500);
  }
}

/**
 * DELETE — remove a plan line. Refused once an actual exists against the
 * shift+product: the plan is what the actual is compared to, and deleting it
 * would leave a shortfall with nothing to be short of.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const { data: line } = await supabaseAdmin
      .from("oc_production_plan_lines")
      .select("shift_id, finished_good_id")
      .eq("id", id)
      .maybeSingle();
    if (!line) return error("Plan line not found", 404);

    const target = line as { shift_id: string; finished_good_id: string };
    const { data: actuals } = await supabaseAdmin
      .from("oc_production_actuals")
      .select("id")
      .eq("shift_id", target.shift_id)
      .eq("finished_good_id", target.finished_good_id)
      .limit(1);
    if ((actuals ?? []).length > 0) {
      return error(
        "Output has already been recorded for this product — the plan line cannot be removed",
        409,
      );
    }

    const { error: dbError } = await supabaseAdmin
      .from("oc_production_plan_lines")
      .delete()
      .eq("id", id);
    if (dbError) return error(`Failed to remove plan line: ${dbError.message}`, 400);
    return success({ id, deleted: true });
  } catch (err) {
    console.error("[OpsControl] plan-line DELETE failed:", err);
    return error("Failed to remove plan line", 500);
  }
}
