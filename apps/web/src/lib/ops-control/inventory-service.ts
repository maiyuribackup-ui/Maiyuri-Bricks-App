/**
 * Operations Control — inventory data access (PRD §3).
 *
 * The pure derivation lives in inventory.ts; this module does the reading.
 * The split matters: the arithmetic that decides what we may promise a
 * customer is testable without a database, and this file stays a thin,
 * boring query layer.
 *
 * Odoo's qty_available reaches us through finished_goods.stock_qty, mirrored
 * by the existing planner sync (pullFinishedGoodStock). That is deliberately
 * the ONLY source of the physical total — OC's ledger explains the total, it
 * does not compete with it.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  deriveBuckets,
  reconcile,
  type InventoryBuckets,
  type InventoryMovement,
  type ReconciliationResult,
  type StockReservation,
} from "@/lib/ops-control/inventory";

/** Roles that may read inventory (sales included: they answer "when can we ship?"). */
export const INVENTORY_READ_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
  "sales",
] as const;

/** Roles that may post a manual movement or reservation. Sales may not. */
export const INVENTORY_WRITE_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
] as const;

export interface ProductInventory extends InventoryBuckets {
  finished_good_id: string;
  product_name: string;
  /** null when Odoo has never reported stock for this product */
  stock_synced_at: string | null;
  reconciliation: ReconciliationResult;
}

interface FinishedGoodRow {
  id: string;
  name: string | null;
  stock_qty: number | null;
  stock_synced_at: string | null;
}

/** Today in IST as a date-only string — the yard's day, not UTC's. */
export function operationalToday(now: Date = new Date()): string {
  // IST is UTC+5:30 year-round (no DST), so a fixed offset is exact here.
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The four buckets for every active product, plus its reconciliation status.
 *
 * Products with no Odoo stock figure are reported with a physical total of 0
 * rather than skipped: "we have no figure for this product" is itself
 * something the screen must be able to show.
 */
export async function loadInventory(asOf?: string): Promise<ProductInventory[]> {
  const today = asOf ?? operationalToday();

  const [goodsRes, movementsRes, reservationsRes] = await Promise.all([
    supabaseAdmin
      .from("finished_goods")
      .select("id, name, stock_qty, stock_synced_at")
      .eq("is_active", true)
      .order("name"),
    supabaseAdmin
      .from("oc_inventory_movements")
      .select("finished_good_id, quantity, movement_date, available_from"),
    supabaseAdmin
      .from("oc_stock_reservations")
      .select("finished_good_id, quantity, available_from, status")
      .eq("status", "active"),
  ]);

  if (goodsRes.error) throw new Error(`Failed to load products: ${goodsRes.error.message}`);
  if (movementsRes.error)
    throw new Error(`Failed to load inventory movements: ${movementsRes.error.message}`);
  if (reservationsRes.error)
    throw new Error(`Failed to load reservations: ${reservationsRes.error.message}`);

  const movementsByProduct = groupBy(
    (movementsRes.data ?? []) as InventoryMovement[],
    (m) => m.finished_good_id,
  );
  const reservationsByProduct = groupBy(
    (reservationsRes.data ?? []) as StockReservation[],
    (r) => r.finished_good_id,
  );

  return ((goodsRes.data ?? []) as FinishedGoodRow[]).map((g) => {
    const movements = movementsByProduct.get(g.id) ?? [];
    const reservations = reservationsByProduct.get(g.id) ?? [];
    const onHand = Number(g.stock_qty ?? 0);
    return {
      finished_good_id: g.id,
      product_name: g.name ?? "—",
      stock_synced_at: g.stock_synced_at,
      ...deriveBuckets(onHand, movements, reservations, today),
      reconciliation: reconcile(onHand, movements),
    };
  });
}

/** Active reservations for a set of SO lines, for coverage and readiness. */
export async function loadReservationsBySoLine(
  soLineIds: string[],
): Promise<Map<string, { quantity: number; available_from: string | null; status: string }[]>> {
  if (soLineIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("oc_stock_reservations")
    .select("so_line_id, quantity, available_from, status")
    .in("so_line_id", soLineIds)
    .eq("status", "active");
  if (error) throw new Error(`Failed to load reservations: ${error.message}`);

  const out = new Map<
    string,
    { quantity: number; available_from: string | null; status: string }[]
  >();
  for (const r of (data ?? []) as {
    so_line_id: string;
    quantity: number;
    available_from: string | null;
    status: string;
  }[]) {
    const list = out.get(r.so_line_id) ?? [];
    list.push({
      quantity: Number(r.quantity),
      available_from: r.available_from,
      status: r.status,
    });
    out.set(r.so_line_id, list);
  }
  return out;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k) ?? [];
    list.push(row);
    out.set(k, list);
  }
  return out;
}
