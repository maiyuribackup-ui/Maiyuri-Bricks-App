export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/factory/reports/downtime?from&to — View 5: causes ranked.
// "days lost" = distinct dates with zero production for that cause;
// "days affected" = distinct dates the cause appeared at all.
export async function GET(request: NextRequest) {
  try {
    const { from, to } = parseQuery(request);
    let query = supabaseAdmin
      .from("factory_production_log")
      .select("log_date, qty_produced, downtime_reason, remarks")
      .neq("downtime_reason", "None");
    if (from) query = query.gte("log_date", from);
    if (to) query = query.lte("log_date", to);
    const { data, error: dbError } = await query;
    if (dbError) return error("Failed to load downtime", 500);

    const byReason = new Map<
      string,
      { entries: number; affected: Set<string>; lost: Set<string>; remarks: string[] }
    >();
    for (const row of data ?? []) {
      const r = byReason.get(row.downtime_reason) ?? {
        entries: 0,
        affected: new Set<string>(),
        lost: new Set<string>(),
        remarks: [],
      };
      r.entries += 1;
      r.affected.add(row.log_date);
      if (Number(row.qty_produced) === 0) r.lost.add(row.log_date);
      if (row.remarks) r.remarks.push(`${row.log_date}: ${row.remarks}`);
      byReason.set(row.downtime_reason, r);
    }

    const ranked = [...byReason.entries()]
      .map(([reason, r]) => ({
        reason,
        entries: r.entries,
        days_affected: r.affected.size,
        days_lost: r.lost.size,
        remarks: r.remarks.slice(0, 6),
      }))
      .sort((a, b) => b.days_lost - a.days_lost || b.days_affected - a.days_affected);

    return success({ causes: ranked });
  } catch (err) {
    console.error("factory downtime report failed:", err);
    return error("Failed to build downtime report", 500);
  }
}
