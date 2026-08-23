export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import {
  SCHEDULE_ROLES,
  OVERSCHEDULE_OVERRIDE_ROLES,
  validateScheduleLines,
  buildCustomerSnapshot,
  insertVersionLines,
  loadSchedule,
} from "@/lib/ops-control/schedules";
import { createOcScheduleSchema } from "@maiyuri/shared";

// GET /api/ops-control/schedules?odoo_order_id= — schedule with all versions
// (newest first) and their lines.
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { odoo_order_id } = parseQuery(request);
    if (!odoo_order_id) return error("odoo_order_id is required", 400);

    const { data: header, error: dbError } = await supabaseAdmin
      .from("oc_delivery_schedules")
      .select("id")
      .eq("odoo_order_id", Number(odoo_order_id))
      .maybeSingle();
    if (dbError) return error("Failed to load schedule", 500);
    if (!header) return success(null);

    return success(await loadSchedule((header as { id: string }).id));
  } catch (err) {
    console.error("[OpsControl] schedules GET failed:", err);
    return error("Failed to load schedule", 500);
  }
}

// POST /api/ops-control/schedules — create header + version 1 (draft) + lines.
// Sales may create schedules (PRD §7.3). Over-scheduling blocks unless an
// authorised role supplies a reason, which is stored ON the version.
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcScheduleSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const validation = await validateScheduleLines(input.odoo_order_id, input.lines);
    if (!validation.ok) return error(validation.errors.join("; "), 400);

    const overrideReason = input.overschedule_override_reason ?? null;
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

    // Order identity comes from the synced SO lines, not from the client.
    const anyLine = validation.soLines.get(input.lines[0].so_line_id)!;

    const { data: schedule, error: schedError } = await supabaseAdmin
      .from("oc_delivery_schedules")
      .insert({
        odoo_order_id: input.odoo_order_id,
        order_name: anyLine.order_name,
        odoo_partner_id: anyLine.odoo_partner_id,
        customer_name: anyLine.partner_name,
        site_location_id: input.site_location_id ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (schedError) {
      if (schedError.code === "23505") {
        return error("A schedule already exists for this order — revise it instead", 409);
      }
      return error(`Failed to create schedule: ${schedError.message}`, 400);
    }
    const sched = schedule as {
      id: string;
      order_name: string;
      odoo_partner_id: number | null;
      customer_name: string | null;
      site_location_id: string | null;
    };

    // Site/customer identity check: a site belonging to another customer
    // needs an explicit decision, not a silent association.
    if (input.site_location_id) {
      const { data: site } = await supabaseAdmin
        .from("oc_site_locations")
        .select("odoo_partner_id")
        .eq("id", input.site_location_id)
        .maybeSingle();
      const sitePartner = (site as { odoo_partner_id: number | null } | null)?.odoo_partner_id;
      if (sitePartner != null && sched.odoo_partner_id != null && sitePartner !== sched.odoo_partner_id) {
        await supabaseAdmin.from("oc_delivery_schedules").delete().eq("id", sched.id);
        return error("That site belongs to a different customer", 400);
      }
    }

    const snapshot = await buildCustomerSnapshot(sched);
    const { data: version, error: verError } = await supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .insert({
        schedule_id: sched.id,
        version_no: 1,
        customer_snapshot: snapshot,
        overschedule_override_reason: validation.overschedules.length > 0 ? overrideReason : null,
        overschedule_override_by: validation.overschedules.length > 0 ? auth.user.id : null,
        overschedule_override_at: validation.overschedules.length > 0 ? new Date().toISOString() : null,
        created_by: auth.user.id,
      })
      .select("id")
      .single();
    if (verError) return error(`Failed to create version: ${verError.message}`, 400);
    const versionId = (version as { id: string }).id;

    await insertVersionLines(versionId, input.odoo_order_id, input.lines);
    await supabaseAdmin
      .from("oc_delivery_schedules")
      .update({ latest_version_id: versionId })
      .eq("id", sched.id);

    await logOcAudit({
      entity: "oc_delivery_schedules",
      entity_id: sched.id,
      action: "created",
      after_value: { odoo_order_id: input.odoo_order_id, lines: input.lines.length },
      performed_by: auth.user.id,
    });

    return success(await loadSchedule(sched.id));
  } catch (err) {
    console.error("[OpsControl] schedules POST failed:", err);
    return error(err instanceof Error ? err.message : "Failed to create schedule", 500);
  }
}
