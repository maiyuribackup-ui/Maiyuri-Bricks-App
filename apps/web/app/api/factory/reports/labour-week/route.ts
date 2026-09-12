export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { factoryWeekEnd, factoryWeekStart, toISODate } from "@/lib/factory";

// GET /api/factory/reports/labour-week?week=YYYY-MM-DD — View 7.
// amount = qty × rate everywhere; advances are negative, so a plain sum
// gives net payable directly.
export async function GET(request: NextRequest) {
  try {
    const { week } = parseQuery(request);
    const anchor = week || toISODate(new Date());
    const from = factoryWeekStart(anchor);
    const to = factoryWeekEnd(anchor);

    const { data, error: dbError } = await supabaseAdmin
      .from("factory_labour")
      .select("*")
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date");
    if (dbError) return error("Failed to load labour", 500);

    const byWorker = new Map<
      string,
      { gross: number; advances: number; net: number; entries: number }
    >();
    let gross = 0;
    let advances = 0;
    for (const row of data ?? []) {
      const amount = Number(row.qty) * Number(row.rate);
      const w = byWorker.get(row.worker) ?? {
        gross: 0,
        advances: 0,
        net: 0,
        entries: 0,
      };
      if (amount >= 0) {
        w.gross += amount;
        gross += amount;
      } else {
        w.advances += amount;
        advances += amount;
      }
      w.net += amount;
      w.entries += 1;
      byWorker.set(row.worker, w);
    }

    return success({
      week_start: from,
      week_end: to,
      entries: data ?? [],
      workers: [...byWorker.entries()]
        .map(([worker, w]) => ({ worker, ...w }))
        .sort((a, b) => b.net - a.net),
      totals: { gross, advances, net: gross + advances },
    });
  } catch (err) {
    console.error("factory labour-week failed:", err);
    return error("Failed to build labour week", 500);
  }
}
