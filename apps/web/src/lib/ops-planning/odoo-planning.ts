/**
 * Odoo pulls for the ops planner: confirmed sales orders (with line
 * quantities) and live finished-good stock. Results are mirrored into
 * Supabase (sales_order_cache, finished_goods.stock_qty) so plan generation
 * is fast and tolerant of Odoo being slow/unreachable.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooExecute } from "@/lib/odoo-service";

type OdooSaleOrder = {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  state: string;
  date_order: string | false;
  commitment_date: string | false;
  amount_total: number;
};

type OdooSaleOrderLine = {
  id: number;
  order_id: [number, string] | false;
  product_id: [number, string] | false;
  product_uom_qty: number;
  qty_delivered: number;
  name: string | false;
};

export type CachedOrderLine = {
  odoo_product_id: number | null;
  finished_good_id: string | null;
  product_name: string;
  qty_ordered: number;
  qty_delivered: number;
};

/**
 * Pull confirmed sale orders ('sale' = confirmed, 'done' = locked) with their
 * lines and upsert into sales_order_cache. remaining_units counts only lines
 * that map to a synced finished good (those are what the factory plans for).
 */
export async function pullConfirmedSalesOrders(): Promise<{
  synced: number;
  openOrders: number;
  removed: number;
}> {
  // Map of odoo product -> local finished good
  const { data: goods } = await supabaseAdmin
    .from("finished_goods")
    .select("id, odoo_product_id, name, plan_excluded")
    .eq("is_active", true);
  const fgByOdooId = new Map(
    (goods ?? []).map((g) => [g.odoo_product_id as number, g]),
  );
  // A line counts toward "remaining to produce" ONLY if it maps to a finished
  // good we still MAKE and plan for. This set is the whitelist: it excludes
  // plan_excluded goods (Discount, Employee Advance, …) AND goods deleted
  // entirely (their id simply isn't here). Otherwise a fully delivered order
  // with a leftover 1-unit discount line looks falsely "open".
  const planableFgIds = new Set(
    (goods ?? [])
      .filter((g) => !(g as { plan_excluded?: boolean }).plan_excluded)
      .map((g) => g.id as string),
  );
  const computeRemaining = (orderLines: CachedOrderLine[]): number =>
    orderLines
      .filter((l) => l.finished_good_id && planableFgIds.has(l.finished_good_id))
      .reduce((sum, l) => sum + Math.max(0, l.qty_ordered - l.qty_delivered), 0);

  const orders = (await odooExecute(
    "sale.order",
    "search_read",
    [[["state", "in", ["sale", "done"]]]],
    {
      fields: [
        "id",
        "name",
        "partner_id",
        "state",
        "date_order",
        "commitment_date",
        "amount_total",
      ],
      order: "date_order desc",
      limit: 300,
    },
  )) as OdooSaleOrder[];

  if (!orders.length) return { synced: 0, openOrders: 0, removed: 0 };

  const lines = (await odooExecute(
    "sale.order.line",
    "search_read",
    [[["order_id", "in", orders.map((o) => o.id)]]],
    {
      fields: [
        "id",
        "order_id",
        "product_id",
        "product_uom_qty",
        "qty_delivered",
        "name",
      ],
      limit: 4000,
    },
  )) as OdooSaleOrderLine[];

  const linesByOrder = new Map<number, CachedOrderLine[]>();
  for (const line of lines) {
    const orderId = Array.isArray(line.order_id) ? line.order_id[0] : null;
    if (!orderId) continue;
    const odooProductId = Array.isArray(line.product_id)
      ? line.product_id[0]
      : null;
    const fg = odooProductId ? fgByOdooId.get(odooProductId) : undefined;
    const entry: CachedOrderLine = {
      odoo_product_id: odooProductId,
      finished_good_id: (fg?.id as string) ?? null,
      product_name:
        (Array.isArray(line.product_id) ? line.product_id[1] : null) ??
        (line.name || "Product"),
      qty_ordered: Number(line.product_uom_qty) || 0,
      qty_delivered: Number(line.qty_delivered) || 0,
    };
    const arr = linesByOrder.get(orderId) ?? [];
    arr.push(entry);
    linesByOrder.set(orderId, arr);
  }

  let openOrders = 0;
  const rows = orders.map((o) => {
    const orderLines = linesByOrder.get(o.id) ?? [];
    // Planable remaining = only lines mapped to a finished good we actually
    // MAKE (see computeRemaining / planableFgIds above).
    const remaining = computeRemaining(orderLines);
    if (remaining > 0 && o.state !== "done") openOrders += 1;
    return {
      odoo_order_id: o.id,
      name: o.name,
      partner_name: Array.isArray(o.partner_id) ? o.partner_id[1] : null,
      state: o.state,
      date_order: o.date_order || null,
      commitment_date: o.commitment_date || null,
      amount_total: o.amount_total ?? null,
      lines: orderLines,
      remaining_units: remaining,
      synced_at: new Date().toISOString(),
    };
  });

  const { error } = await supabaseAdmin
    .from("sales_order_cache")
    .upsert(rows, { onConflict: "odoo_order_id" });
  if (error) throw new Error(`sales_order_cache upsert failed: ${error.message}`);

  // Reconcile cancellations: an order cancelled (or reset to draft) in Odoo
  // stops matching state in ('sale','done') and would otherwise linger in the
  // cache with stale remaining_units > 0 — the planner would keep scheduling
  // phantom production for it (reliability audit, blocker S3). Ask Odoo for
  // the CURRENT state of every cached order id and evict the dead ones.
  // (Deliberately not "delete not-in-fetched": the fetch is capped at 300.)
  let removed = 0;
  const { data: cached } = await supabaseAdmin
    .from("sales_order_cache")
    .select("odoo_order_id");
  const cachedIds = (cached ?? []).map((r) => r.odoo_order_id as number);
  if (cachedIds.length) {
    const dead = (await odooExecute(
      "sale.order",
      "search_read",
      [[["id", "in", cachedIds], ["state", "not in", ["sale", "done"]]]],
      { fields: ["id"], limit: cachedIds.length },
    )) as { id: number }[];
    if (dead.length) {
      const { error: delErr } = await supabaseAdmin
        .from("sales_order_cache")
        .delete()
        .in("odoo_order_id", dead.map((d) => d.id));
      if (delErr) {
        console.error("sales_order_cache eviction failed:", delErr.message);
      } else {
        removed = dead.length;
      }
    }
  }

  // Recompute remaining_units for cached rows OUTSIDE the 300-order fetch
  // window from their stored lines. Without this, an old order (e.g. S00056,
  // Mar 2024) whose remaining was computed under stale rules never self-heals —
  // the upsert only touches fetched rows, so an old phantom-open order lingers
  // until someone fixes it by hand. Uses the SAME whitelist as the fresh calc
  // (computeRemaining): a line counts only if its finished good still exists
  // and is planable. This only ever LOWERS a stale remaining (we scan rows that
  // are currently > 0), so it can clear false-opens but never resurrect a
  // legitimately-closed order.
  let recomputed = 0;
  try {
    const fetchedIds = new Set(orders.map((o) => o.id));
    const { data: staleRows } = await supabaseAdmin
      .from("sales_order_cache")
      .select("id, odoo_order_id, lines, remaining_units")
      .eq("state", "sale")
      .gt("remaining_units", 0);
    for (const row of staleRows ?? []) {
      // Fetched rows were just upserted with a fresh remaining — skip them.
      if (fetchedIds.has(row.odoo_order_id as number)) continue;
      const storedLines = (row.lines as CachedOrderLine[] | null) ?? [];
      const newRemaining = computeRemaining(storedLines);
      if (newRemaining !== Number(row.remaining_units)) {
        const { error: upErr } = await supabaseAdmin
          .from("sales_order_cache")
          .update({ remaining_units: newRemaining })
          .eq("id", row.id as string);
        if (upErr) {
          console.error(
            `remaining_units recompute failed for order ${row.odoo_order_id}:`,
            upErr.message,
          );
        } else {
          recomputed += 1;
        }
      }
    }
  } catch (err) {
    // Best-effort self-heal: never let it break the sync.
    console.error("stale remaining_units recompute failed:", err);
  }
  if (recomputed > 0) {
    // Data drift was detected and corrected — worth surfacing (warn, not log).
    console.warn(
      `[ops-planning] self-healed remaining_units on ${recomputed} cached order(s)`,
    );
  }

  return { synced: rows.length, openOrders, removed };
}

/**
 * Refresh finished_goods.stock_qty from Odoo's qty_available (one read for
 * all synced products).
 */
export async function pullFinishedGoodStock(): Promise<{ updated: number }> {
  const { data: goods } = await supabaseAdmin
    .from("finished_goods")
    .select("id, odoo_product_id")
    .eq("is_active", true);
  const ids = (goods ?? [])
    .map((g) => g.odoo_product_id as number)
    .filter(Boolean);
  if (!ids.length) return { updated: 0 };

  const products = (await odooExecute("product.product", "read", [ids], {
    fields: ["id", "qty_available"],
  })) as { id: number; qty_available: number }[];

  const now = new Date().toISOString();
  let updated = 0;
  for (const p of products) {
    const good = (goods ?? []).find((g) => g.odoo_product_id === p.id);
    if (!good) continue;
    const { error } = await supabaseAdmin
      .from("finished_goods")
      .update({ stock_qty: p.qty_available ?? 0, stock_synced_at: now })
      .eq("id", good.id);
    if (!error) updated += 1;
  }
  return { updated };
}
