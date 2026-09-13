export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { factoryWeekEnd, factoryWeekStart, toISODate } from "@/lib/factory";

// GET /api/factory/reports/friday-review?week=YYYY-MM-DD
// Rajesh's Friday deck: the target COMMITTED in last week's review vs what
// actually happened, plus live stock and the week's downtime.
export async function GET(request: NextRequest) {
  try {
    const { week } = parseQuery(request);
    const anchor = week || toISODate(new Date());
    const from = factoryWeekStart(anchor);
    const to = factoryWeekEnd(anchor);

    const [plans, logs, deliveries, stock] = await Promise.all([
      supabaseAdmin
        .from("factory_production_plan")
        .select("plan_date, planned_qty, factory_products(code)")
        .gte("plan_date", from)
        .lte("plan_date", to),
      supabaseAdmin
        .from("factory_production_log")
        .select("log_date, qty_produced, downtime_reason, remarks, factory_products(code)")
        .gte("log_date", from)
        .lte("log_date", to),
      supabaseAdmin
        .from("factory_deliveries")
        .select("qty, status, factory_products(code)")
        .gte("delivery_date", from)
        .lte("delivery_date", to),
      supabaseAdmin.from("factory_stock_v").select("*").order("code"),
    ]);

    // Supabase types embedded relations as object OR array depending on
    // inference — normalise both shapes.
    const code = (r: { factory_products: unknown }): string => {
      const fp = r.factory_products as { code?: string } | { code?: string }[] | null;
      return (Array.isArray(fp) ? fp[0]?.code : fp?.code) ?? "?";
    };

    // Production: committed plan vs actual, per product
    const perProduct = new Map<string, { planned: number; actual: number }>();
    for (const p of plans.data ?? []) {
      const e = perProduct.get(code(p)) ?? { planned: 0, actual: 0 };
      e.planned += Number(p.planned_qty);
      perProduct.set(code(p), e);
    }
    for (const l of logs.data ?? []) {
      const e = perProduct.get(code(l)) ?? { planned: 0, actual: 0 };
      e.actual += Number(l.qty_produced);
      perProduct.set(code(l), e);
    }
    const production = [...perProduct.entries()]
      .map(([product_code, v]) => ({
        product_code,
        planned: v.planned,
        actual: v.actual,
        variance: v.actual - v.planned,
        achievement_pct: v.planned > 0 ? Math.round((v.actual / v.planned) * 100) : null,
      }))
      .sort((a, b) => a.product_code.localeCompare(b.product_code));

    // Deliveries: committed (all scheduled rows) vs completed
    let committedQty = 0;
    let deliveredQty = 0;
    let postponed = 0;
    for (const d of deliveries.data ?? []) {
      committedQty += Number(d.qty);
      if (d.status === "Delivered") deliveredQty += Number(d.qty);
      if (d.status === "Postponed") postponed += 1;
    }

    // Downtime within the week
    const downtime = (logs.data ?? [])
      .filter((l) => l.downtime_reason !== "None")
      .map((l) => ({
        date: l.log_date as string,
        product_code: code(l),
        reason: l.downtime_reason as string,
        remarks: (l.remarks as string | null) ?? null,
      }));

    return success({
      week_start: from,
      week_end: to,
      production,
      production_totals: {
        planned: production.reduce((s, p) => s + p.planned, 0),
        actual: production.reduce((s, p) => s + p.actual, 0),
      },
      deliveries: {
        committed_qty: committedQty,
        delivered_qty: deliveredQty,
        variance: deliveredQty - committedQty,
        postponed_count: postponed,
      },
      downtime,
      stock: stock.data ?? [],
    });
  } catch (err) {
    console.error("factory friday-review failed:", err);
    return error("Failed to build Friday review", 500);
  }
}
