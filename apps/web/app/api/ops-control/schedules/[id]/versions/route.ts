export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { SCHEDULE_ROLES, buildCustomerSnapshot } from "@/lib/ops-control/schedules";
import { createOcScheduleVersionSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/ops-control/schedules/[id]/versions — open a new working version.
// The DB's partial unique index allows at most ONE open version (draft/sent/
// revision_requested) per schedule; a second attempt surfaces as a clean 409.
// Revising a schedule that has a confirmed version REQUIRES a reason (PRD §14)
// — that is what lets Maiyuri distinguish internal delays from
// customer-requested changes later.
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createOcScheduleVersionSchema);
    if (parsed.error) return parsed.error;

    const { data: schedule } = await supabaseAdmin
      .from("oc_delivery_schedules")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!schedule) return notFound("Schedule");
    const sched = schedule as {
      id: string;
      order_name: string;
      odoo_partner_id: number | null;
      customer_name: string | null;
      site_location_id: string | null;
      active_confirmed_version_id: string | null;
    };

    if (sched.active_confirmed_version_id && !parsed.data.revision_reason) {
      return error(
        "This schedule has a confirmed version — a revision reason is required",
        400,
      );
    }

    const { data: maxVer } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .select("version_no")
      .eq("schedule_id", id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = ((maxVer as { version_no: number } | null)?.version_no ?? 0) + 1;

    const siteLocationId = parsed.data.site_location_id ?? sched.site_location_id;
    const snapshot = await buildCustomerSnapshot({ ...sched, site_location_id: siteLocationId });

    const { data: version, error: verError } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .insert({
        schedule_id: id,
        version_no: nextNo,
        revision_reason: parsed.data.revision_reason ?? null,
        customer_snapshot: snapshot,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (verError) {
      if (verError.message.includes("uq_oc_sched_one_open_version")) {
        return error(
          "Another version is still open (draft or awaiting the customer). Close it before starting a new one.",
          409,
        );
      }
      return error(`Failed to create version: ${verError.message}`, 400);
    }

    const versionId = (version as { id: string }).id;
    await supabaseAdmin
      .from("oc_delivery_schedules")
      .update({ latest_version_id: versionId, site_location_id: siteLocationId })
      .eq("id", id);

    await logOcAudit({
      entity: "oc_delivery_schedule_versions",
      entity_id: versionId,
      action: "revision_created",
      after_value: { version_no: nextNo, reason: parsed.data.revision_reason ?? null },
      performed_by: auth.user.id,
    });

    return success(version);
  } catch (err) {
    console.error("[OpsControl] version POST failed:", err);
    return error("Failed to create schedule version", 500);
  }
}
