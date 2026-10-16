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

// POST …/send — draft -> sent. From this moment the version's lines are
// frozen by the database trigger; what the customer received is permanent.
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id, vid } = await params;

    const { data: version } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .select("id, status, schedule_id")
      .eq("id", vid)
      .eq("schedule_id", id)
      .maybeSingle();
    if (!version) return notFound("Schedule version");
    if ((version as { status: string }).status !== "draft") {
      return error("Only a draft version can be sent", 409);
    }

    const { count } = await supabaseAdmin
      .from("oc_delivery_schedule_lines")
      .select("id", { count: "exact", head: true })
      .eq("version_id", vid);
    if (!count) return error("Cannot send an empty schedule", 400);

    const { data: updated, error: dbError } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", vid)
      .eq("status", "draft")
      .select("*")
      .single();
    if (dbError) return error(`Failed to send: ${dbError.message}`, 400);

    // Header shows 'sent' only until a confirmed commitment exists; a sent
    // REVISION does not un-confirm the customer's standing commitment.
    await supabaseAdmin
      .from("oc_delivery_schedules")
      .update({ status: "sent" })
      .eq("id", id)
      .is("active_confirmed_version_id", null);

    await logOcAudit({
      entity: "oc_delivery_schedule_versions",
      entity_id: vid,
      action: "sent",
      performed_by: auth.user.id,
    });
    return success(updated);
  } catch (err) {
    console.error("[OpsControl] send failed:", err);
    return error("Failed to send schedule version", 500);
  }
}
