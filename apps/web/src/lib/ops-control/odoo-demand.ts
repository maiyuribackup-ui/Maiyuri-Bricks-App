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
import { odooExecute, odooPickField, odooRelationLabel } from "@/lib/odoo-service";
import { classifyLine } from "@/lib/ops-control/classification";
import type { OcLineKind } from "@maiyuri/shared";

const PAGE_SIZE = 500;
/** A 'running' run older than this is considered crashed and no longer blocks. */
const STALE_RUN_MINUTES = 10;
/**
 * Overall budget for the Odoo fetch phase. The route allows 300s; failing at
 * 240 means the sync reports WHY it gave up (run marked 'error', 502 with a
 * message, Telegram alert with a cause) instead of being killed mid-flight by
 * FUNCTION_INVOCATION_TIMEOUT and leaving its run row orphaned as 'running' —
 * which is exactly what happened on the nights of 26-28 Aug.
 */
export const FETCH_BUDGET_MS = 240_000;

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
  // The unit-of-measure field is read by whichever name this Odoo has
  // (product_uom_id since Odoo 19, product_uom before), so it is not a fixed
  // key on this type — see uomField below.
  [field: string]: unknown;
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

/** Throws once the sync has spent its whole fetch budget. Exported for tests. */
export function assertWithinBudget(deadline: number, what: string): void {
  if (Date.now() > deadline) {
    throw new Error(
      `Odoo fetch budget of ${FETCH_BUDGET_MS / 1000}s exhausted while reading ${what}. ` +
        "Odoo is responding too slowly to complete a full sync; nothing was written.",
    );
  }
}

/** Paginate a search_read to completion — never a silent cap. */
async function fetchAll<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  onPage: (() => void) | undefined,
  deadline: number,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    assertWithinBudget(deadline, model);
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
  // The guarantee is ATOMIC: the partial unique index
  // uq_oc_sync_runs_one_running admits exactly one 'running' row per kind, so
  // two near-simultaneous callers cannot both open a run — the loser's insert
  // fails with 23505. A crashed run is retired first (marked 'error') so it
  // cannot hold the index forever.
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  await supabaseAdmin
    .from("oc_sync_runs")
    .update({
      status: "error",
      completed_at: new Date().toISOString(),
      error: `stale: still 'running' after ${STALE_RUN_MINUTES} minutes; retired by a newer sync`,
    })
    .eq("kind", "demand")
    .eq("status", "running")
    .lt("started_at", staleCutoff);

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
  if (runError?.code === "23505") {
    throw new Error("A demand sync is already running. Try again in a minute.");
  }
  if (runError || !run) throw new Error(`Could not open a sync run: ${runError?.message}`);
  const runId = (run as { id: string }).id;

  try {
    // ---- fetch (outside any DB transaction) ---------------------------
    const deadline = Date.now() + FETCH_BUDGET_MS;
    let pages = 0;
    const bump = () => {
      pages += 1;
    };

    const orders = await fetchAll<OdooOrder>(
      "sale.order",
      [["state", "in", ["sale", "done"]]],
      ["id", "name", "partner_id", "state", "date_order"],
      bump,
      deadline,
    );

    const orderById = new Map(orders.map((o) => [o.id, o]));
    const orderIds = orders.map((o) => o.id);

    // Ask Odoo what it calls the unit of measure before requesting it: the
    // Odoo 19 upgrade renamed product_uom to product_uom_id, and asking for
    // the wrong one fails the whole search_read, not just that column.
    const uomField = await odooPickField("sale.order.line", [
      "product_uom_id",
      "product_uom",
    ]);

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
            uomField,
          ],
          bump,
          deadline,
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
          deadline,
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
        uom: odooRelationLabel(l, uomField),
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
