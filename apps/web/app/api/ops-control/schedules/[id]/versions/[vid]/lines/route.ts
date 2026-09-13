export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SCHEDULE_ROLES,
  OVERSCHEDULE_OVERRIDE_ROLES,
  validateScheduleLines,
  insertVersionLines,
} from "@/lib/ops-control/schedules";
import { replaceOcScheduleLinesSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string; vid: string }>;
}

// PUT /api/ops-control/schedules/[id]/versions/[vid]/lines — replace the
// lines of a DRAFT version. The database trigger is the backstop for
// immutability; this returns the clean 409 first. Over-scheduling blocks
// unless an authorised role supplies a reason (stored on the version).
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id, vid } = await params;
    const parsed = await parseBody(request, replaceOcScheduleLinesSchema);
    if (parsed.error) return parsed.error;

    const { data: schedule } = await supabaseAdmin
      .from("oc_delivery_schedules")
      .select("id, odoo_order_id, lock_version")
      .eq("id", id)
      .maybeSingle();
    if (!schedule) return notFound("Schedule");
    const sched = schedule as { id: string; odoo_order_id: number; lock_version: number };
    if (sched.lock_version !== parsed.data.lock_version) {
      return error("This schedule changed while you were editing — reload and retry", 409);
    }

    const { data: version } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .select("id, status")
      .eq("id", vid)
      .eq("schedule_id", id)
      .maybeSingle();
    if (!version) return notFound("Schedule version");
    if ((version as { status: string }).status !== "draft") {
      return error("This version has been sent — its lines are immutable. Create a revision.", 409);
    }

    const validation = await validateScheduleLines(sched.odoo_order_id, parsed.data.lines);
    if (!validation.ok) return error(validation.errors.join("; "), 400);

    const overrideReason = parsed.data.overschedule_override_reason ?? null;
    if (validation.overschedules.length > 0) {
      const detail = validation.overschedules
        .map((o) => `${o.product_name ?? o.so_line_id} exceeds the open order by ${o.excess}`)
        .join("; ");
      if (!overrideReason) {
        return error(`Over-scheduling blocked: ${detail}. Provide an override reason to proceed.`, 409);
      }
      if (!OVERSCHEDULE_OVERRIDE_ROLES.includes(auth.role as never)) {
        return error(`Over-scheduling blocked: ${detail}. Your role cannot override.`, 403);
      }
    }

    await supabaseAdmin.from("oc_delivery_schedule_lines").delete().eq("version_id", vid);
    await insertVersionLines(vid, sched.odoo_order_id, parsed.data.lines);

    await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .update({
        overschedule_override_reason: validation.overschedules.length > 0 ? overrideReason : null,
        overschedule_override_by: validation.overschedules.length > 0 ? auth.user.id : null,
        overschedule_override_at:
          validation.overschedules.length > 0 ? new Date().toISOString() : null,
      })
      .eq("id", vid);

    const { data: lines } = await supabaseAdmin
      .from("oc_delivery_schedule_lines")
      .select("*")
      .eq("version_id", vid)
      .order("sort_order");
    return success(lines ?? []);
  } catch (err) {
    console.error("[OpsControl] lines PUT failed:", err);
    return error(err instanceof Error ? err.message : "Failed to save lines", 500);
  }
}
