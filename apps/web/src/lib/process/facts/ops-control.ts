/**
 * Stock facts from ops-control (the authoritative inventory service).
 * Reuses the same bucket + readiness maths the planning screens use, so the
 * process never disagrees with the factory's own numbers.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  loadReservationsBySoLine,
  operationalToday,
} from "@/lib/ops-control/inventory-service";
import { computeReadiness, remainingQty } from "@/lib/ops-control/fulfilment";
import type { StockFact } from "../gates";

interface SoLine {
  id: string;
  product_name: string | null;
  qty_ordered: number;
  qty_delivered: number;
}

/**
 * Can the reserved stock for this order ship on `asOf`? One row per demand
 * line; `fully_ready` only when every line is covered by dispatchable stock.
 */
export async function readOrderStockPosition(
  odooOrderId: number,
  asOf?: string | null,
): Promise<StockFact> {
  const date =
    asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : operationalToday();
  const { data, error } = await supabaseAdmin
    .from("oc_sales_order_lines")
    .select("id, product_name, qty_ordered, qty_delivered")
    .eq("odoo_order_id", odooOrderId)
    .eq("is_demand", true)
    .eq("source_active", true);
  if (error) throw new Error(`Failed to load order lines: ${error.message}`);

  const lines = (data ?? []) as SoLine[];
  if (lines.length === 0)
    return { has_demand: false, lines: [], as_of: date, fully_ready: false };

  const reservations = await loadReservationsBySoLine(lines.map((l) => l.id));
  const out = lines.map((l) => {
    const remaining = remainingQty(
      Number(l.qty_ordered),
      Number(l.qty_delivered),
    );
    const r = computeReadiness(reservations.get(l.id) ?? [], remaining, date);
    return {
      so_line_id: l.id,
      product_name: l.product_name ?? "—",
      remaining,
      ready_now: r.readyNow,
      ready_from: r.readyFrom,
      uncovered: Math.max(0, remaining - r.readyNow - r.curing),
    };
  });
  return {
    has_demand: true,
    lines: out,
    as_of: date,
    fully_ready: out.every(
      (l) => l.remaining <= 0 || l.ready_now >= l.remaining,
    ),
  };
}
