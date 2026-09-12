export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SCHEDULE_ROLES, validateScheduleLines } from "@/lib/ops-control/schedules";
import { confirmOcScheduleVersionSchema, type OcScheduleLineInput } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string; vid: string }>;
}

// POST …/confirm — records the CUSTOMER's confirmation (PRD §12-13). Runs the
// atomic RPC: supersede the previous confirmed version, mark this one
// confirmed, flip both pointers, bump lock_version — all or nothing.
// Over-scheduling is re-checked against Odoo's CURRENT delivered quantities
// unless the version already carries a recorded override.
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id, vid } = await params;
    const parsed = await parseBody(request, confirmOcScheduleVersionSchema);
    if (parsed.error) return parsed.error;

    const { data: schedule } = await supabaseAdmin
      .from("oc_delivery_schedules")
      .select("odoo_order_id")
      .eq("id", id)
      .maybeSingle();
    if (!schedule) return error("Schedule not found", 404);

    const { data: version } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .select("overschedule_override_reason")
      .eq("id", vid)
      .eq("schedule_id", id)
      .maybeSingle();
    if (!version) return error("Schedule version not found", 404);

    if (!(version as { overschedule_override_reason: string | null }).overschedule_override_reason) {
      const { data: lines } = await supabaseAdmin
        .from("oc_delivery_schedule_lines")
        .select("so_line_id, delivery_date, quantity")
        .eq("version_id", vid);
      const check = await validateScheduleLines(
        (schedule as { odoo_order_id: number }).odoo_order_id,
        (lines ?? []) as OcScheduleLineInput[],
      );
      if (check.overschedules.length > 0) {
        const detail = check.overschedules
          .map((o) => `${o.product_name ?? o.so_line_id} exceeds the open order by ${o.excess}`)
          .join("; ");
        return error(
          `Cannot confirm: ${detail}. Revise the schedule or record an authorised override.`,
          409,
        );
      }
    }

    const { data, error: rpcError } = await supabaseAdmin.rpc("oc_confirm_schedule_version", {
      p_schedule_id: id,
      p_version_id: vid,
      p_note: parsed.data.confirmation_note ?? null,
      p_user: auth.user.id,
      p_expected_lock: parsed.data.lock_version,
    });
    if (rpcError) {
      if (rpcError.message.includes("lock_version mismatch")) {
        return error("This schedule changed while you were working — reload and retry", 409);
      }
      if (rpcError.message.includes("only a sent version")) {
        return error("Only a sent version can be confirmed", 409);
      }
      return error(`Failed to confirm: ${rpcError.message}`, 400);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] confirm failed:", err);
    return error("Failed to confirm schedule version", 500);
  }
}
