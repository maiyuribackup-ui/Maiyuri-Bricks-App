/**
 * Operations Control — Odoo demand sync (PRD §85).
 *
 * Pulls EVERY open sale.order (paginated — the planner's older pull caps at
 * 300 and was already truncating at 314 orders), their lines including
 * Odoo's display_type, and product types; classifies each line; then applies
 * the COMPLETE snapshot through one transactional RPC
 * (oc_apply_demand_sync). Two guarantees follow:
 *   - an Odoo fetch failure touches nothing (we never start writing), and
 *   - a database failure rolls back everything (the RPC is one transaction),
 * so the table only ever holds a complete old snapshot or a complete new one.
 *
 * Rows are soft-retired, never deleted: schedule history keeps referencing
 * an SO line forever, even after Odoo cancels it.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooExecute } from "@/lib/odoo-service";
import { classifyLine } from "@/lib/ops-control/classification";
import type { OcLineKind } from "@maiyuri/shared";

const PAGE_SIZE = 500;
/** A 'running' run older than this is considered crashed and no longer blocks. */
const STALE_RUN_MINUTES = 10;

type OdooOrder = {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  state: string;
  date_order: string | false;
};

type OdooLine = {
  id: number;
  order_id: [number, string] | false;
  product_id: [number, string] | false;
  name: string | false;
  display_type: string | false;
  product_uom_qty: number;
  qty_delivered: number;
  product_uom: [number, string] | false;
};

type OdooProduct = { id: number; type: string | false };

export interface DemandSyncResult {
  run_id: string;
  orders: number;
  pages: number;
  lines: number;
  demand: number;
  service_note: number;
  unmapped: number;
  retired: number;
  unmapped_products: { odoo_product_id: number; product_name: string; open_qty: number }[];
}

/** Paginate a search_read to completion — never a silent cap. */
async function fetchAll<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  onPage?: () => void,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = (await odooExecute(model, "search_read", [domain], {
      fields,
      offset,
      limit: PAGE_SIZE,
      order: "id asc",
    })) as T[];
    onPage?.();
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
    offset += PAGE_SIZE;
  }
}

export async function runDemandSync(options: {
  source: "manual" | "cron";
  triggeredBy?: string | null;
}): Promise<DemandSyncResult> {
  // ---- concurrency: one active demand sync at a time --------------------
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  const { data: running } = await supabaseAdmin
    .from("oc_sync_runs")
    .select("id, started_at")
    .eq("kind", "demand")
    .eq("status", "running")
    .gte("started_at", staleCutoff)
    .limit(1);
  if (running && running.length > 0) {
    throw new Error("A demand sync is already running. Try again in a minute.");
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from("oc_sync_runs")
    .insert({
      kind: "demand",
      source: options.source,
      status: "running",
      triggered_by: options.triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Could not open a sync run: ${runError?.message}`);
  const runId = (run as { id: string }).id;

  try {
    // ---- fetch (outside any DB transaction) ---------------------------
    let pages = 0;
    const bump = () => {
      pages += 1;
    };

    const orders = await fetchAll<OdooOrder>(
      "sale.order",
      [["state", "in", ["sale", "done"]]],
      ["id", "name", "partner_id", "state", "date_order"],
      bump,
    );

    const orderById = new Map(orders.map((o) => [o.id, o]));
    const orderIds = orders.map((o) => o.id);

    const lines: OdooLine[] = [];
    // chunk the order-id domain so it never grows unbounded
    for (let i = 0; i < orderIds.length; i += 200) {
      const chunk = orderIds.slice(i, i + 200);
      lines.push(
        ...(await fetchAll<OdooLine>(
          "sale.order.line",
          [["order_id", "in", chunk]],
          [
            "id",
            "order_id",
            "product_id",
            "name",
            "display_type",
            "product_uom_qty",
            "qty_delivered",
            "product_uom",
          ],
          bump,
        )),
      );
    }

    const productIds = [
      ...new Set(lines.map((l) => (l.product_id ? l.product_id[0] : null)).filter((x): x is number => x !== null)),
    ];
    const products: OdooProduct[] = [];
    for (let i = 0; i < productIds.length; i += 200) {
      products.push(
        ...(await fetchAll<OdooProduct>(
          "product.product",
          [["id", "in", productIds.slice(i, i + 200)]],
          ["id", "type"],
          bump,
        )),
      );
    }
    const productTypeById = new Map(products.map((p) => [p.id, p.type === false ? null : p.type]));

    // ---- classification inputs ----------------------------------------
    const [{ data: mappings }, { data: overrides }] = await Promise.all([
      supabaseAdmin.from("oc_product_mapping").select("odoo_product_id, finished_good_id"),
      supabaseAdmin
        .from("oc_product_classification_overrides")
        .select("odoo_product_id, line_kind"),
    ]);
    const mappingByProduct = new Map(
      (mappings ?? []).map((m) => [m.odoo_product_id as number, m.finished_good_id as string]),
    );
    const overrideByProduct = new Map(
      (overrides ?? []).map((o) => [o.odoo_product_id as number, o.line_kind as OcLineKind]),
    );

    // ---- build the complete snapshot in memory ------------------------
    const unmappedAgg = new Map<number, { product_name: string; open_qty: number }>();
    const rows = lines.map((l) => {
      const order = l.order_id ? orderById.get(l.order_id[0]) : undefined;
      const odooProductId = l.product_id ? l.product_id[0] : null;
      const productName = l.product_id ? l.product_id[1] : (l.name === false ? null : l.name);
      const cls = classifyLine({
        displayType: l.display_type,
        productType: odooProductId !== null ? (productTypeById.get(odooProductId) ?? null) : null,
        mappedFinishedGoodId:
          odooProductId !== null ? (mappingByProduct.get(odooProductId) ?? null) : null,
        override: odooProductId !== null ? (overrideByProduct.get(odooProductId) ?? null) : null,
      });

      const qtyOrdered = Number(l.product_uom_qty) || 0;
      const qtyDelivered = Number(l.qty_delivered) || 0;
      if (cls.lineKind === "unmapped" && odooProductId !== null) {
        const open = Math.max(0, qtyOrdered - qtyDelivered);
        if (open > 0) {
          const agg = unmappedAgg.get(odooProductId) ?? {
            product_name: productName ?? `Odoo product ${odooProductId}`,
            open_qty: 0,
          };
          agg.open_qty += open;
          unmappedAgg.set(odooProductId, agg);
        }
      }

      return {
        odoo_line_id: l.id,
        odoo_order_id: order?.id ?? (l.order_id ? l.order_id[0] : 0),
        order_name: order?.name ?? (l.order_id ? l.order_id[1] : "?"),
        odoo_partner_id: order?.partner_id ? order.partner_id[0] : null,
        partner_name: order?.partner_id ? order.partner_id[1] : null,
        odoo_product_id: odooProductId,
        product_name: productName,
        display_type: l.display_type === false ? null : l.display_type,
        finished_good_id: cls.finishedGoodId,
        line_kind: cls.lineKind,
        is_demand: cls.isDemand,
        qty_ordered: qtyOrdered,
        qty_delivered: qtyDelivered,
        uom: l.product_uom ? l.product_uom[1] : null,
        order_state: order?.state ?? null,
        date_order: order?.date_order ? order.date_order : null,
      };
    });

    // orders/pages are informational; write them while the run is 'running'
    await supabaseAdmin
      .from("oc_sync_runs")
      .update({ orders_fetched: orders.length, pages_fetched: pages })
      .eq("id", runId);

    // ---- apply atomically ---------------------------------------------
    const { data: applied, error: applyError } = await supabaseAdmin.rpc(
      "oc_apply_demand_sync",
      { p_run_id: runId, p_rows: rows },
    );
    if (applyError) throw new Error(`Sync apply failed: ${applyError.message}`);

    const result = applied as {
      upserted: number;
      retired: number;
      demand: number;
      service_note: number;
      unmapped: number;
    };

    return {
      run_id: runId,
      orders: orders.length,
      pages,
      lines: result.upserted,
      demand: result.demand,
      service_note: result.service_note,
      unmapped: result.unmapped,
      retired: result.retired,
      unmapped_products: [...unmappedAgg.entries()]
        .map(([odoo_product_id, v]) => ({ odoo_product_id, ...v }))
        .sort((a, b) => b.open_qty - a.open_qty),
    };
  } catch (err) {
    // Mark the run failed; the RPC's transaction ensured no partial data.
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("oc_sync_runs")
      .update({ status: "error", completed_at: new Date().toISOString(), error: message })
      .eq("id", runId);
    throw err;
  }
}
