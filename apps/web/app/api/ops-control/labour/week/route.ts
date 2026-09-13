export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { LABOUR_READ_ROLES, loadLabourWeek } from "@/lib/ops-control/labour-service";
import { recentWeeks, weekRange } from "@/lib/ops-control/labour";
import { operationalToday } from "@/lib/ops-control/inventory-service";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/ops-control/labour/week[?week_start=YYYY-MM-DD]
 *
 * One factory week (Saturday to Friday) with its ledger, roll-up and
 * settlement. Any date inside a week resolves to that week's start, so the
 * caller never has to know where the boundary falls.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, LABOUR_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { week_start } = parseQuery(request);
    if (week_start && !DATE_ONLY.test(week_start)) {
      return error("week_start must be a YYYY-MM-DD date", 400);
    }
    const today = operationalToday();
    const { start } = weekRange(week_start || today);
    const week = await loadLabourWeek(start);
    return success({ ...week, weeks: recentWeeks(today, 12) });
  } catch (err) {
    console.error("[OpsControl] labour week GET failed:", err);
    return error("Failed to load labour week", 500);
  }
}
