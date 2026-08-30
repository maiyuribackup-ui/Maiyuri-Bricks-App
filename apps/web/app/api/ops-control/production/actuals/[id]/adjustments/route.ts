export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { error, created, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { createOcActualAdjustmentSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST — correct a POSTED actual with a delta (PRD §8.2).
 *
 * "We counted 1,200, it was really 1,150" is recorded as a −50 row; the
 * original 1,200 stands. This matters most once labour is paid: if last
 * week's settlement used the 1,200, the system needs to generate a −50
 * differential, which is only possible when both numbers still exist.
 *
 * Only posted rows can be adjusted — a draft is simply edited.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createOcActualAdjustmentSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: actual } = await supabaseAdmin
      .from("oc_production_actuals")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!actual) return error("Production entry not found", 404);
    if ((actual as { status: string }).status === "draft") {
      return error("This entry is still a draft — edit it directly instead", 400);
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_actual_adjustments")
      .insert({ actual_id: id, ...input, created_by: auth.user.id })
      .select("*")
      .single();
    if (dbError) return error(`Failed to record adjustment: ${dbError.message}`, 400);

    // The row's own status becomes 'adjusted' so the screen can show that its
    // effective figure differs from what was posted.
    await supabaseAdmin
      .from("oc_production_actuals")
      .update({ status: "adjusted" })
      .eq("id", id);

    await logOcAudit({
      entity: "oc_production_actuals",
      entity_id: id,
      action: "updated",
      after_value: input,
      reason: input.reason,
      performed_by: auth.user.id,
    });
    return created(data);
  } catch (err) {
    console.error("[OpsControl] adjustment POST failed:", err);
    return error("Failed to record adjustment", 500);
  }
}
