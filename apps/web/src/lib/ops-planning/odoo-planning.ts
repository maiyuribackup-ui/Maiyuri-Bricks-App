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
}> {
  // Map of odoo product -> local finished good
  const { data: goods } = await supabaseAdmin
    .from("finished_goods")
    .select("id, odoo_product_id, name")
    .eq("is_active", true);
  const fgByOdooId = new Map(
    (goods ?? []).map((g) => [g.odoo_product_id as number, g]),
  );

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

  if (!orders.length) return { synced: 0, openOrders: 0 };

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
    // Planable remaining = only lines that map to a finished good we make.
    const remaining = orderLines
      .filter((l) => l.finished_good_id)
      .reduce((sum, l) => sum + Math.max(0, l.qty_ordered - l.qty_delivered), 0);
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

  return { synced: rows.length, openOrders };
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
