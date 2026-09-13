export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import {
  INVENTORY_READ_ROLES,
  loadInventory,
  operationalToday,
} from "@/lib/ops-control/inventory-service";

/**
 * GET /api/ops-control/inventory/reconcile[?all=true]
 *
 * Where OC's ledger and Odoo's on-hand figure disagree (PRD §86). Drift is
 * reported, never absorbed: a difference usually means an unsynced write-back,
 * a stock move made directly in Odoo, or a missing operational record — each
 * of which wants a human, not a silent correction.
 *
 * By default only the exceptions are returned, because a reconciliation screen
 * listing every product in agreement teaches people to ignore it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { all } = parseQuery(request);
    const asOf = operationalToday();
    const products = await loadInventory(asOf);
    const rows = products.map((p) => ({
      finished_good_id: p.finished_good_id,
      product_name: p.product_name,
      stock_synced_at: p.stock_synced_at,
      ...p.reconciliation,
    }));
    const exceptions = rows.filter((r) => r.hasDrift);
    return success({
      as_of: asOf,
      checked: rows.length,
      exception_count: exceptions.length,
      rows: all === "true" ? rows : exceptions,
    });
  } catch (err) {
    console.error("[OpsControl] inventory reconcile GET failed:", err);
    return error("Failed to reconcile inventory", 500);
  }
}
