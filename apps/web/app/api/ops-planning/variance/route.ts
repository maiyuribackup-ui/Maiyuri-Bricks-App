export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/ops-planning/variance?days=14 — plan-vs-actual across recent plans.
// Only PAST (or today's) items count: future planned items aren't "misses".
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(1, Number(searchParams.get("days") ?? 14)));
    const today = new Date(Date.now() + 5.5 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const from = new Date(Date.now() - days * 86400000 + 5.5 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: items, error: dbError } = await supabaseAdmin
      .from("ops_plan_items")
      .select(
        "id, item_type, item_date, product_name, finished_good_id, quantity, actual_quantity, status, sale_order_ref, customer_name",
      )
      .gte("item_date", from)
      .lte("item_date", today)
      .order("item_date", { ascending: false });

    if (dbError) return error("Failed to load variance data", 500);

    const production = (items ?? []).filter((i) => i.item_type === "production");
    const planned = production.reduce((s, i) => s + Number(i.quantity), 0);
    const actual = production.reduce(
      (s, i) => s + Number(i.actual_quantity ?? 0),
      0,
    );
    const deliveries = (items ?? []).filter((i) => i.item_type === "delivery");
    const deliveriesDone = deliveries.filter((i) => i.status === "done").length;

    return success({
      window: { from, to: today },
      production: {
        planned_units: planned,
        actual_units: actual,
        fulfillment_pct: planned > 0 ? Math.round((actual / planned) * 100) : null,
      },
      deliveries: {
        planned: deliveries.length,
        completed: deliveriesDone,
      },
      items: items ?? [],
    });
  } catch (err) {
    console.error("variance rollup failed:", err);
    return error("Variance rollup failed", 500);
  }
}
