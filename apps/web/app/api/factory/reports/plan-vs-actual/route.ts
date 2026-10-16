export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { factoryWeekEnd, factoryWeekStart, toISODate, parseISODate } from "@/lib/factory";

type Row = {
  date: string;
  product_code: string;
  planned: number;
  actual: number | null; // null = no log entry yet for that day/product
  variance: number | null;
  achievement_pct: number | null; // null when planned is 0
  plan_note: string | null;
  downtime_reason: string | null;
};

// GET /api/factory/reports/plan-vs-actual?week=YYYY-MM-DD — View 4.
// Actuals are read from the production log, never re-keyed.
export async function GET(request: NextRequest) {
  try {
    const { week } = parseQuery(request);
    const anchor = week || toISODate(new Date());
    const from = factoryWeekStart(anchor);
    const to = factoryWeekEnd(anchor);

    const [{ data: plans }, { data: logs }] = await Promise.all([
      supabaseAdmin
        .from("factory_production_plan")
        .select("plan_date, planned_qty, plan_note, factory_products(code)")
        .gte("plan_date", from)
        .lte("plan_date", to),
      supabaseAdmin
        .from("factory_production_log")
        .select("log_date, qty_produced, downtime_reason, factory_products(code)")
        .gte("log_date", from)
        .lte("log_date", to),
    ]);

    const logMap = new Map<string, { qty: number; downtime: string }>();
    for (const l of logs ?? []) {
      const code = (l.factory_products as { code?: string } | null)?.code ?? "?";
      logMap.set(`${l.log_date}|${code}`, {
        qty: Number(l.qty_produced),
        downtime: l.downtime_reason,
      });
    }

    const rows: Row[] = (plans ?? [])
      .map((p) => {
        const code = (p.factory_products as { code?: string } | null)?.code ?? "?";
        const log = logMap.get(`${p.plan_date}|${code}`);
        const planned = Number(p.planned_qty);
        const actual = log ? log.qty : null;
        return {
          date: p.plan_date as string,
          product_code: code,
          planned,
          actual,
          variance: actual === null ? null : actual - planned,
          achievement_pct:
            planned > 0 && actual !== null
              ? Math.round((actual / planned) * 100)
              : null,
          plan_note: (p.plan_note as string | null) ?? null,
          downtime_reason: log?.downtime ?? null,
        };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.product_code.localeCompare(b.product_code),
      );

    const plannedTotal = rows.reduce((s, r) => s + r.planned, 0);
    const actualTotal = rows.reduce((s, r) => s + (r.actual ?? 0), 0);
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = parseISODate(from);
      d.setDate(d.getDate() + i);
      days.push(toISODate(d));
    }

    return success({
      week_start: from,
      week_end: to,
      days,
      rows,
      totals: {
        planned: plannedTotal,
        actual: actualTotal,
        variance: actualTotal - plannedTotal,
        achievement_pct:
          plannedTotal > 0 ? Math.round((actualTotal / plannedTotal) * 100) : null,
      },
    });
  } catch (err) {
    console.error("factory plan-vs-actual failed:", err);
    return error("Failed to build plan vs actual", 500);
  }
}
