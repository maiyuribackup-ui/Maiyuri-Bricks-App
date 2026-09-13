export const dynamic = "force-dynamic";

import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { factoryWeekStart } from "@/lib/factory";

// GET /api/factory/reports/cement — View 6: bricks per cement bag by week and
// product. The sheet showed a 40.4–54.4 swing on the largest input cost.
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_production_log")
      .select("log_date, qty_produced, cement_bags, data_flag, factory_products(code)")
      .gt("cement_bags", 0)
      .order("log_date");
    if (dbError) return error("Failed to load cement data", 500);

    // Weekly aggregation per product
    const byWeekProduct = new Map<string, { qty: number; bags: number; estimated: boolean }>();
    // Daily points for the scatter/trend
    const daily = (data ?? []).map((row) => {
      const code = (row.factory_products as { code?: string } | null)?.code ?? "?";
      const qty = Number(row.qty_produced);
      const bags = Number(row.cement_bags);
      const week = factoryWeekStart(row.log_date as string);
      const key = `${week}|${code}`;
      const agg = byWeekProduct.get(key) ?? { qty: 0, bags: 0, estimated: false };
      agg.qty += qty;
      agg.bags += bags;
      if (row.data_flag === "Estimated") agg.estimated = true;
      byWeekProduct.set(key, agg);
      return {
        date: row.log_date as string,
        product_code: code,
        bricks_per_bag: bags > 0 ? Math.round((qty / bags) * 10) / 10 : null,
        data_flag: row.data_flag as string,
      };
    });

    const weekly = [...byWeekProduct.entries()]
      .map(([key, agg]) => {
        const [week_start, product_code] = key.split("|");
        return {
          week_start,
          product_code,
          bricks_per_bag: agg.bags > 0 ? Math.round((agg.qty / agg.bags) * 10) / 10 : null,
          total_bags: Math.round(agg.bags * 10) / 10,
          includes_estimates: agg.estimated,
        };
      })
      .sort(
        (a, b) =>
          a.week_start.localeCompare(b.week_start) ||
          a.product_code.localeCompare(b.product_code),
      );

    return success({ daily, weekly });
  } catch (err) {
    console.error("factory cement report failed:", err);
    return error("Failed to build cement report", 500);
  }
}
