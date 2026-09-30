export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { error, created, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { DISPATCH_ROLES } from "@/lib/ops-control/dispatch";
import { createOcDeliveryAdjustmentSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST — correct a COMPLETED delivery with a delta (PRD §8.2).
 *
 * The original stands. That matters once loading labour is paid from actual
 * loaded quantities: a correction has to generate a differential, which is
 * only possible while both figures still exist.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createOcDeliveryAdjustmentSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: line } = await supabaseAdmin
      .from("oc_trip_load_lines")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!line) return error("Load line not found", 404);
    if ((line as { status: string }).status === "draft") {
      return error("This delivery is still a draft — edit it directly instead", 400);
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_delivery_actual_adjustments")
      .insert({ load_line_id: id, ...input, created_by: auth.user.id })
      .select("*")
      .single();
    if (dbError) return error(`Failed to record adjustment: ${dbError.message}`, 400);

    await supabaseAdmin
      .from("oc_trip_load_lines")
      .update({ status: "adjusted" })
      .eq("id", id);

    await logOcAudit({
      entity: "oc_trip_load_lines",
      entity_id: id,
      action: "updated",
      after_value: input,
      reason: input.reason,
      performed_by: auth.user.id,
    });
    return created(data);
  } catch (err) {
    console.error("[OpsControl] delivery adjustment failed:", err);
    return error("Failed to record adjustment", 500);
  }
}
