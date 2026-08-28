export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  commitmentStatus,
  revisionStatus,
  coverageStatus,
  remainingQty,
} from "@/lib/ops-control/fulfilment";
import { SCHEDULE_ROLES } from "@/lib/ops-control/schedules";

// GET /api/ops-control/demand — the open Sales Order backlog (PRD §9.1).
// Active demand lines joined with their schedules; three status dimensions
// per line. Coverage is 'not_evaluated' until Phase 3 supplies reservation
// data — absence of information is not presented as bad news.
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const {
      customer,
      product,
      status: statusFilter,
      include_completed: includeCompletedParam,
    } = parseQuery(request);
    const includeCompleted = includeCompletedParam === "true";

    let query = supabaseAdmin
      .from("oc_sales_order_lines")
      .select("*")
      .eq("is_demand", true)
      .eq("source_active", true)
      .order("order_name", { ascending: false });
    if (customer) query = query.ilike("partner_name", `%${customer}%`);
    if (product) query = query.ilike("product_name", `%${product}%`);
    const { data: lines, error: linesError } = await query.limit(1000);
    if (linesError) return error("Failed to load demand", 500);

    const orderIds = [...new Set((lines ?? []).map((l) => l.odoo_order_id as number))];
    const { data: schedules } = orderIds.length
      ? await supabaseAdmin
          .from("oc_delivery_schedules")
          .select(
            "id, odoo_order_id, status, lock_version, latest_version_id, active_confirmed_version_id",
          )
          .in("odoo_order_id", orderIds)
      : { data: [] };

    const scheduleByOrder = new Map(
      (schedules ?? []).map((s) => [s.odoo_order_id as number, s]),
    );

    const scheduleIds = (schedules ?? []).map((s) => s.id as string);
    const { data: versions } = scheduleIds.length
      ? await supabaseAdmin
          .from("oc_delivery_schedule_versions")
          .select("id, schedule_id, version_no, status, oc_delivery_schedule_lines(so_line_id, quantity)")
          .in("schedule_id", scheduleIds)
      : { data: [] };

    type VersionRow = {
      id: string;
      schedule_id: string;
      version_no: number;
      status: string;
      oc_delivery_schedule_lines: { so_line_id: string; quantity: number }[];
    };
    const versionById = new Map((versions ?? []).map((v) => [v.id as string, v as VersionRow]));
    const openBySchedule = new Map<string, VersionRow>();
    for (const v of (versions ?? []) as VersionRow[]) {
      if (["draft", "sent", "revision_requested"].includes(v.status)) {
        openBySchedule.set(v.schedule_id, v);
      }
    }

    const sumFor = (version: VersionRow | undefined, soLineId: string) =>
      version?.oc_delivery_schedule_lines
        .filter((l) => l.so_line_id === soLineId)
        .reduce((a, l) => a + Number(l.quantity), 0) ?? 0;

    const rows = (lines ?? []).map((l) => {
      const sched = scheduleByOrder.get(l.odoo_order_id as number) as
        | {
            id: string;
            status: string;
            lock_version: number;
            latest_version_id: string | null;
            active_confirmed_version_id: string | null;
          }
        | undefined;
      const confirmedVersion = sched?.active_confirmed_version_id
        ? versionById.get(sched.active_confirmed_version_id)
        : undefined;
      const openVersion = sched ? openBySchedule.get(sched.id) : undefined;
      const openStatus = (openVersion?.status ?? null) as
        | "draft"
        | "sent"
        | "revision_requested"
        | null;

      const qtyOrdered = Number(l.qty_ordered);
      const qtyDelivered = Number(l.qty_delivered);
      return {
        ...l,
        remaining: remainingQty(qtyOrdered, qtyDelivered),
        schedule_id: sched?.id ?? null,
        schedule_lock_version: sched?.lock_version ?? null,
        scheduled_qty: sumFor(openVersion ?? confirmedVersion, l.id as string),
        confirmed_qty: sumFor(confirmedVersion, l.id as string),
        commitment_status: commitmentStatus({
          qtyOrdered,
          qtyDelivered,
          hasConfirmedVersion: !!confirmedVersion,
          openVersionStatus: openStatus,
        }),
        revision_status: revisionStatus(openStatus),
        coverage_status: coverageStatus(null), // Phase 3 supplies real inputs
      };
    });

    // Demand planning is about what is still OWED. A line delivered in full
    // ("Completed") is history: it cannot be scheduled, produced or dispatched,
    // and 1,000-of-1,000 rows crowd out the ones needing action. They stay one
    // query param away rather than being deleted from the view.
    const openRows = rows.filter((r) => r.remaining > 0);
    const completedHidden = rows.length - openRows.length;
    const visible = includeCompleted ? rows : openRows;

    const filtered = statusFilter
      ? visible.filter((r) => r.commitment_status === statusFilter)
      : visible;

    // Unmapped products with open demand — the red list for the mapping screen.
    const { data: unmappedLines } = await supabaseAdmin
      .from("oc_sales_order_lines")
      .select("odoo_product_id, product_name, qty_ordered, qty_delivered")
      .eq("line_kind", "unmapped")
      .eq("source_active", true);
    const unmappedAgg = new Map<number, { product_name: string | null; open_qty: number }>();
    for (const u of unmappedLines ?? []) {
      const open = Math.max(0, Number(u.qty_ordered) - Number(u.qty_delivered));
      if (open <= 0 || u.odoo_product_id == null) continue;
      const agg = unmappedAgg.get(u.odoo_product_id as number) ?? {
        product_name: u.product_name as string | null,
        open_qty: 0,
      };
      agg.open_qty += open;
      unmappedAgg.set(u.odoo_product_id as number, agg);
    }

    // Two different facts, previously conflated: the LATEST run (which may be
    // in flight or failed) and the last run that actually SUCCEEDED. Reporting
    // the latest run's timestamp as "last synced" told the user data was 7
    // hours old when in truth that run never completed and the data was three
    // days stale.
    const [{ data: lastRun }, { data: lastSuccess }] = await Promise.all([
      supabaseAdmin
        .from("oc_sync_runs")
        .select("status, started_at, completed_at, error")
        .eq("kind", "demand")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("oc_sync_runs")
        .select("status, started_at, completed_at, orders_fetched, lines_fetched")
        .eq("kind", "demand")
        .eq("status", "success")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return success({
      lines: filtered,
      unmapped: [...unmappedAgg.entries()]
        .map(([odoo_product_id, v]) => ({ odoo_product_id, ...v }))
        .sort((a, b) => b.open_qty - a.open_qty),
      last_sync: lastRun ?? null,
      last_success: lastSuccess ?? null,
      completed_hidden: completedHidden,
      include_completed: includeCompleted,
      role: auth.role,
    });
  } catch (err) {
    console.error("[OpsControl] demand GET failed:", err);
    return error("Failed to load demand", 500);
  }
}
