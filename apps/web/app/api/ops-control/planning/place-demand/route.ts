export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import {
  SCHEDULE_ROLES,
  OVERSCHEDULE_OVERRIDE_ROLES,
  buildCustomerSnapshot,
} from "@/lib/ops-control/schedules";
import { checkOverschedule } from "@/lib/ops-control/fulfilment";
import { placeOcDemandSchema } from "@maiyuri/shared";

/**
 * POST /api/ops-control/planning/place-demand
 *
 * Put demand that was sold but never scheduled onto a delivery date, for
 * several order lines at once, from the planning grid.
 *
 * WHAT THIS WRITES IS ALWAYS A DRAFT. Never a commitment, never a customer
 * PDF, never a change to what a customer is currently holding. That is the
 * property that makes placing a dozen lines in one click safe: the draft
 * still has to be sent and confirmed, one customer at a time, on the Demand
 * screen. Anything else would let a grid interaction promise deliveries to
 * people.
 *
 * Each order lands in one of four states, and the response says which:
 *
 *  - CREATED   no schedule existed. Header + draft V1 + lines.
 *  - APPENDED  an open DRAFT version existed. Lines added to it.
 *  - REVISED   a confirmed version exists and no version is open, so adding
 *              a line means opening a revision. Requires `revision_reason`
 *              (PRD §14) — without it the order is refused BY NAME rather
 *              than silently revised.
 *  - SKIPPED   a version is already sent or awaiting the customer. The
 *              database allows only one open version per schedule, and more
 *              importantly the customer is mid-conversation about that
 *              version. It is not ours to add to.
 *
 * Partial success is normal here and is reported per order rather than
 * failing the batch: one customer awaiting a reply should not stop the other
 * eleven from being scheduled.
 */

type Outcome = "created" | "appended" | "revised" | "skipped";

interface OrderResult {
  odoo_order_id: number;
  order_name: string;
  outcome: Outcome;
  lines: number;
  schedule_id: string | null;
  version_id: string | null;
  reason?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, placeOcDemandSchema);
    if (parsed.error) return parsed.error;
    const { placements, revision_reason, overschedule_override_reason } = parsed.data;

    // ------------------------------------------------- resolve the SO lines
    const soLineIds = [...new Set(placements.map((p) => p.so_line_id))];
    const { data: soRows, error: soErr } = await supabaseAdmin
      .from("oc_sales_order_lines")
      .select(
        "id, odoo_order_id, order_name, odoo_partner_id, partner_name, product_name, line_kind, is_demand, source_active, qty_ordered, qty_delivered",
      )
      .in("id", soLineIds);
    if (soErr) return error(`Failed to load order lines: ${soErr.message}`, 500);

    type SoLine = {
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
    };
    const soLines = new Map<string, SoLine>(
      ((soRows ?? []) as SoLine[]).map((r) => [r.id, r]),
    );

    // Reject the whole request on a bad line: an unknown or non-schedulable
    // line means the caller's view of the world is stale, and quietly
    // scheduling the rest would hide that.
    const problems: string[] = [];
    for (const id of soLineIds) {
      const so = soLines.get(id);
      if (!so) {
        problems.push(`Order line ${id} does not exist`);
        continue;
      }
      if (!so.source_active) {
        problems.push(`${so.product_name ?? so.id} is no longer on the Odoo order`);
      }
      if (so.line_kind !== "product" || !so.is_demand) {
        problems.push(`${so.product_name ?? so.id} is not a schedulable product line`);
      }
    }
    if (problems.length > 0) return error(problems.join("; "), 400);

    // --------------------------------------------- group placements by order
    const byOrder = new Map<number, typeof placements>();
    for (const p of placements) {
      const so = soLines.get(p.so_line_id)!;
      const list = byOrder.get(so.odoo_order_id) ?? [];
      list.push(p);
      byOrder.set(so.odoo_order_id, list);
    }

    const results: OrderResult[] = [];

    for (const [odooOrderId, orderPlacements] of byOrder) {
      const anyLine = soLines.get(orderPlacements[0].so_line_id)!;

      // ------------------------------------------------ find the schedule
      const { data: existing } = await supabaseAdmin
        .from("oc_delivery_schedules")
        .select("id, order_name, odoo_partner_id, customer_name, site_location_id, active_confirmed_version_id")
        .eq("odoo_order_id", odooOrderId)
        .maybeSingle();

      type ScheduleRow = {
        id: string;
        order_name: string;
        odoo_partner_id: number | null;
        customer_name: string | null;
        site_location_id: string | null;
        active_confirmed_version_id: string | null;
      };
      let schedule = (existing ?? null) as ScheduleRow | null;
      let outcome: Outcome = "appended";

      if (!schedule) {
        const { data: created, error: schedErr } = await supabaseAdmin
          .from("oc_delivery_schedules")
          .insert({
            odoo_order_id: odooOrderId,
            order_name: anyLine.order_name,
            odoo_partner_id: anyLine.odoo_partner_id,
            customer_name: anyLine.partner_name,
            created_by: auth.user.id,
          })
          .select("id, order_name, odoo_partner_id, customer_name, site_location_id, active_confirmed_version_id")
          .single();
        if (schedErr) {
          results.push({
            odoo_order_id: odooOrderId,
            order_name: anyLine.order_name,
            outcome: "skipped",
            lines: 0,
            schedule_id: null,
            version_id: null,
            reason: `Could not open a schedule: ${schedErr.message}`,
          });
          continue;
        }
        schedule = created as ScheduleRow;
        outcome = "created";
      }
      const sched = schedule!;

      // -------------------------------------------- find the open version
      const { data: openVer } = await supabaseAdmin
        .from("oc_delivery_schedule_versions")
        .select("id, version_no, status")
        .eq("schedule_id", sched.id)
        .in("status", ["draft", "sent", "revision_requested"])
        .maybeSingle();
      const open = openVer as {
        id: string;
        version_no: number;
        status: string;
      } | null;

      if (open && open.status !== "draft") {
        results.push({
          odoo_order_id: odooOrderId,
          order_name: sched.order_name,
          outcome: "skipped",
          lines: 0,
          schedule_id: sched.id,
          version_id: open.id,
          reason: `V${open.version_no} is with the customer (${open.status.replace("_", " ")}). Settle that before adding to this order.`,
        });
        continue;
      }

      let versionId: string;
      if (open) {
        versionId = open.id;
      } else {
        // No open version. If a confirmed one exists, this is a revision of
        // a live customer commitment and PRD §14 requires a stated reason.
        if (sched.active_confirmed_version_id && !revision_reason) {
          results.push({
            odoo_order_id: odooOrderId,
            order_name: sched.order_name,
            outcome: "skipped",
            lines: 0,
            schedule_id: sched.id,
            version_id: null,
            reason:
              "This order already has a confirmed schedule. Adding to it opens a revision, which needs a reason.",
          });
          continue;
        }

        const { data: maxVer } = await supabaseAdmin
          .from("oc_delivery_schedule_versions")
          .select("version_no")
          .eq("schedule_id", sched.id)
          .order("version_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextNo = ((maxVer as { version_no: number } | null)?.version_no ?? 0) + 1;
        const snapshot = await buildCustomerSnapshot(sched);

        const { data: version, error: verErr } = await supabaseAdmin
          .from("oc_delivery_schedule_versions")
          .insert({
            schedule_id: sched.id,
            version_no: nextNo,
            revision_reason: sched.active_confirmed_version_id ? revision_reason : null,
            customer_snapshot: snapshot,
            created_by: auth.user.id,
          })
          .select("id")
          .single();
        if (verErr) {
          results.push({
            odoo_order_id: odooOrderId,
            order_name: sched.order_name,
            outcome: "skipped",
            lines: 0,
            schedule_id: sched.id,
            version_id: null,
            reason: verErr.message.includes("uq_oc_sched_one_open_version")
              ? "Another version opened for this order at the same moment. Reload and try again."
              : `Could not open a version: ${verErr.message}`,
          });
          continue;
        }
        versionId = (version as { id: string }).id;
        if (sched.active_confirmed_version_id) outcome = "revised";
        else if (outcome !== "created") outcome = "appended";
      }

      // ------------------------------------------------ over-scheduling
      // Existing draft lines count too: placing 500 into a draft that already
      // promises 800 against a 1,000 order is the over-schedule, even though
      // neither number alone exceeds it.
      const { data: draftLines } = await supabaseAdmin
        .from("oc_delivery_schedule_lines")
        .select("so_line_id, quantity")
        .eq("version_id", versionId);
      const already = new Map<string, number>();
      for (const l of (draftLines ?? []) as { so_line_id: string; quantity: number }[]) {
        already.set(l.so_line_id, (already.get(l.so_line_id) ?? 0) + Number(l.quantity));
      }

      const excesses: string[] = [];
      const totals = new Map<string, number>();
      for (const p of orderPlacements) {
        totals.set(p.so_line_id, (totals.get(p.so_line_id) ?? 0) + p.quantity);
      }
      for (const [soLineId, added] of totals) {
        const so = soLines.get(soLineId)!;
        const check = checkOverschedule(
          (already.get(soLineId) ?? 0) + added,
          Number(so.qty_ordered),
          Number(so.qty_delivered),
        );
        if (!check.ok) {
          excesses.push(
            `${so.product_name ?? soLineId} exceeds the open order by ${check.excess}`,
          );
        }
      }

      if (excesses.length > 0) {
        const detail = excesses.join("; ");
        if (!overschedule_override_reason) {
          results.push({
            odoo_order_id: odooOrderId,
            order_name: sched.order_name,
            outcome: "skipped",
            lines: 0,
            schedule_id: sched.id,
            version_id: versionId,
            reason: `Over-scheduling blocked: ${detail}.`,
          });
          continue;
        }
        if (!OVERSCHEDULE_OVERRIDE_ROLES.includes(auth.role as never)) {
          results.push({
            odoo_order_id: odooOrderId,
            order_name: sched.order_name,
            outcome: "skipped",
            lines: 0,
            schedule_id: sched.id,
            version_id: versionId,
            reason: `Over-scheduling blocked: ${detail}. Your role cannot override.`,
          });
          continue;
        }
        await supabaseAdmin
          .from("oc_delivery_schedule_versions")
          .update({
            overschedule_override_reason,
            overschedule_override_by: auth.user.id,
            overschedule_override_at: new Date().toISOString(),
          })
          .eq("id", versionId);
      }

      // ------------------------------------------------------ write lines
      const baseSort = (draftLines ?? []).length;
      const { error: lineErr } = await supabaseAdmin
        .from("oc_delivery_schedule_lines")
        .insert(
          orderPlacements.map((p, i) => ({
            version_id: versionId,
            so_line_id: p.so_line_id,
            odoo_order_id: odooOrderId,
            delivery_date: p.delivery_date,
            quantity: p.quantity,
            sort_order: baseSort + i,
          })),
        );
      if (lineErr) {
        results.push({
          odoo_order_id: odooOrderId,
          order_name: sched.order_name,
          outcome: "skipped",
          lines: 0,
          schedule_id: sched.id,
          version_id: versionId,
          reason: `Could not save lines: ${lineErr.message}`,
        });
        continue;
      }

      await supabaseAdmin
        .from("oc_delivery_schedules")
        .update({ latest_version_id: versionId })
        .eq("id", sched.id);

      await logOcAudit({
        entity: "oc_delivery_schedule_versions",
        entity_id: versionId,
        action: outcome === "revised" ? "revision_created" : "created",
        after_value: {
          placed_from: "planning_grid",
          lines: orderPlacements.length,
          revision_reason: outcome === "revised" ? revision_reason : null,
        },
        performed_by: auth.user.id,
      });

      results.push({
        odoo_order_id: odooOrderId,
        order_name: sched.order_name,
        outcome,
        lines: orderPlacements.length,
        schedule_id: sched.id,
        version_id: versionId,
      });
    }

    const placed = results
      .filter((r) => r.outcome !== "skipped")
      .reduce((n, r) => n + r.lines, 0);

    return success({
      placed,
      orders: results.length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      results,
    });
  } catch (err) {
    console.error("[OpsControl] place-demand POST failed:", err);
    return error("Failed to place demand", 500);
  }
}
