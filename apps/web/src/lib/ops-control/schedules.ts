/**
 * Operations Control — delivery-schedule domain logic shared by the routes.
 *
 * The hard invariants live in the DATABASE (draft-only line mutation, one
 * open working version, composite FKs, atomic confirm RPC). This module does
 * the friendly half: validation with usable messages before the DB would
 * reject, snapshot capture, and the over-scheduling check.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkOverschedule } from "@/lib/ops-control/fulfilment";
import type { OcScheduleLineInput } from "@maiyuri/shared";

/** Roles that may work schedules (PRD §7.3 includes sales). */
export const SCHEDULE_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
  "sales",
] as const;

/** Roles that may override the over-scheduling block (sales may not). */
export const OVERSCHEDULE_OVERRIDE_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
] as const;

export interface SoLineRow {
  id: string;
  odoo_order_id: number;
  order_name: string;
  odoo_partner_id: number | null;
  partner_name: string | null;
  product_name: string | null;
  line_kind: string;
  is_demand: boolean;
  source_active: boolean;
  qty_ordered: number;
  qty_delivered: number;
}

export interface LineValidation {
  ok: boolean;
  /** blocking problems, human-readable */
  errors: string[];
  /** over-scheduling excesses per SO line — blocking unless overridden */
  overschedules: { so_line_id: string; product_name: string | null; excess: number }[];
  soLines: Map<string, SoLineRow>;
}

/**
 * Validate proposed schedule lines against their SO lines. New lines must
 * reference active, demand-bearing product lines OF THE SCHEDULE'S ORDER
 * (the composite FK is the backstop; this produces the readable error first).
 */
export async function validateScheduleLines(
  odooOrderId: number,
  lines: OcScheduleLineInput[],
): Promise<LineValidation> {
  const ids = [...new Set(lines.map((l) => l.so_line_id))];
  const { data, error } = await supabaseAdmin
    .from("oc_sales_order_lines")
    .select(
      "id, odoo_order_id, order_name, odoo_partner_id, partner_name, product_name, line_kind, is_demand, source_active, qty_ordered, qty_delivered",
    )
    .in("id", ids);
  if (error) throw new Error(`Failed to load sales order lines: ${error.message}`);

  const soLines = new Map<string, SoLineRow>(
    ((data ?? []) as SoLineRow[]).map((r) => [r.id, r]),
  );

  const errors: string[] = [];
  const totals = new Map<string, number>();

  for (const line of lines) {
    const so = soLines.get(line.so_line_id);
    if (!so) {
      errors.push(`Sales order line ${line.so_line_id} does not exist`);
      continue;
    }
    if (so.odoo_order_id !== odooOrderId) {
      errors.push(
        `${so.product_name ?? so.id} belongs to ${so.order_name}, not to this schedule's order`,
      );
    }
    if (!so.source_active) {
      errors.push(`${so.product_name ?? so.id} no longer exists on the Odoo order`);
    }
    if (so.line_kind !== "product" || !so.is_demand) {
      errors.push(`${so.product_name ?? so.id} is not a schedulable product line`);
    }
    totals.set(line.so_line_id, (totals.get(line.so_line_id) ?? 0) + line.quantity);
  }

  const overschedules: LineValidation["overschedules"] = [];
  for (const [soLineId, total] of totals) {
    const so = soLines.get(soLineId);
    if (!so) continue;
    const check = checkOverschedule(total, Number(so.qty_ordered), Number(so.qty_delivered));
    if (!check.ok) {
      overschedules.push({
        so_line_id: soLineId,
        product_name: so.product_name,
        excess: check.excess,
      });
    }
  }

  return { ok: errors.length === 0, errors, overschedules, soLines };
}

/**
 * The customer-facing commitment snapshot stored ON the version. The PDF and
 * any future rendering read only this — never mutable masters — so editing a
 * site three months later cannot rewrite what V1 told the customer.
 */
export async function buildCustomerSnapshot(schedule: {
  order_name: string;
  odoo_partner_id: number | null;
  customer_name: string | null;
  site_location_id: string | null;
}): Promise<Record<string, unknown>> {
  let site: Record<string, unknown> | null = null;
  if (schedule.site_location_id) {
    const { data } = await supabaseAdmin
      .from("oc_site_locations")
      .select("site_name, address, gmaps_url, contact_name, phone, odoo_partner_id")
      .eq("id", schedule.site_location_id)
      .maybeSingle();
    site = (data as Record<string, unknown>) ?? null;
  }
  return {
    order_name: schedule.order_name,
    odoo_partner_id: schedule.odoo_partner_id,
    customer_name: schedule.customer_name,
    site_name: site?.site_name ?? null,
    address: site?.address ?? null,
    gmaps_url: site?.gmaps_url ?? null,
    contact_name: site?.contact_name ?? null,
    phone: site?.phone ?? null,
  };
}

/** Insert the lines of a (draft) version. */
export async function insertVersionLines(
  versionId: string,
  odooOrderId: number,
  lines: OcScheduleLineInput[],
): Promise<void> {
  const { error } = await supabaseAdmin.from("oc_delivery_schedule_lines").insert(
    lines.map((l, i) => ({
      version_id: versionId,
      so_line_id: l.so_line_id,
      odoo_order_id: odooOrderId,
      delivery_date: l.delivery_date,
      quantity: l.quantity,
      sort_order: i,
      notes: l.notes ?? null,
    })),
  );
  if (error) throw new Error(`Failed to save schedule lines: ${error.message}`);
}

/** Load a schedule with all versions and their lines, newest version first. */
export async function loadSchedule(scheduleId: string) {
  const { data: schedule, error } = await supabaseAdmin
    .from("oc_delivery_schedules")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!schedule) return null;

  const { data: versions } = await supabaseAdmin
    .from("oc_delivery_schedule_versions")
    .select("*, oc_delivery_schedule_lines(*)")
    .eq("schedule_id", scheduleId)
    .order("version_no", { ascending: false });

  return { ...(schedule as Record<string, unknown>), versions: versions ?? [] };
}
