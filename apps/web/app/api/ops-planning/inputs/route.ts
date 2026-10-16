export const dynamic = "force-dynamic";
export const maxDuration = 60; // Odoo XML-RPC round-trips

import { success, error } from "@/lib/api-utils";
import {
  pullConfirmedSalesOrders,
  pullFinishedGoodStock,
} from "@/lib/ops-planning/odoo-planning";
import { getPlanningInputs } from "@/lib/ops-planning/planning-service";

// GET /api/ops-planning/inputs — cached open orders, products+params, settings
export async function GET() {
  try {
    return success(await getPlanningInputs());
  } catch (err) {
    console.error("ops-planning inputs failed:", err);
    return error("Failed to load planning inputs", 500);
  }
}

// POST /api/ops-planning/inputs — refresh from Odoo (orders + stock), then return
export async function POST() {
  try {
    const [ordersRes, stockRes] = await Promise.allSettled([
      pullConfirmedSalesOrders(),
      pullFinishedGoodStock(),
    ]);
    const inputs = await getPlanningInputs();
    return success({
      ...inputs,
      sync: {
        orders:
          ordersRes.status === "fulfilled"
            ? ordersRes.value
            : { error: String(ordersRes.reason) },
        stock:
          stockRes.status === "fulfilled"
            ? stockRes.value
            : { error: String(stockRes.reason) },
      },
    });
  } catch (err) {
    console.error("ops-planning input sync failed:", err);
    return error("Failed to sync planning inputs from Odoo", 500);
  }
}
