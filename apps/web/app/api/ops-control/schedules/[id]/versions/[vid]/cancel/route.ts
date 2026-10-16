export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { SCHEDULE_ROLES } from "@/lib/ops-control/schedules";

interface Params {
  params: Promise<{ id: string; vid: string }>;
}

// POST …/cancel — close an OPEN working version (draft or sent) without
// confirming it, freeing the one-open-version slot for a new revision. A
// confirmed version can never be cancelled this way — it is superseded by
// confirming its replacement.
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id, vid } = await params;
    const { data: version } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .select("id, status")
      .eq("id", vid)
      .eq("schedule_id", id)
      .maybeSingle();
    if (!version) return notFound("Schedule version");
    const status = (version as { status: string }).status;
    if (!["draft", "sent", "revision_requested"].includes(status)) {
      return error(`A ${status} version cannot be cancelled`, 409);
    }

    const { data: updated, error: dbError } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .update({ status: "cancelled" })
      .eq("id", vid)
      .in("status", ["draft", "sent", "revision_requested"])
      .select("*")
      .single();
    if (dbError) return error(`Failed to cancel: ${dbError.message}`, 400);

    await logOcAudit({
      entity: "oc_delivery_schedule_versions",
      entity_id: vid,
      action: "cancelled",
      before_value: { status },
      performed_by: auth.user.id,
    });
    return success(updated);
  } catch (err) {
    console.error("[OpsControl] cancel failed:", err);
    return error("Failed to cancel schedule version", 500);
  }
}
