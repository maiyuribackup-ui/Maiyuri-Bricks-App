export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import {
  INVENTORY_READ_ROLES,
  loadInventory,
  operationalToday,
} from "@/lib/ops-control/inventory-service";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/ops-control/inventory[?as_of=YYYY-MM-DD]
 *
 * The four buckets per product (PRD §4) plus each product's reconciliation
 * against Odoo. `as_of` exists so the screen can answer "what will be
 * dispatchable on Friday?" without a second endpoint.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { as_of } = parseQuery(request);
    if (as_of && !DATE_ONLY.test(as_of)) {
      return error("as_of must be a YYYY-MM-DD date", 400);
    }
    const asOf = as_of || operationalToday();
    const products = await loadInventory(asOf);
    return success({ as_of: asOf, products });
  } catch (err) {
    console.error("[OpsControl] inventory GET failed:", err);
    return error("Failed to load inventory", 500);
  }
}
