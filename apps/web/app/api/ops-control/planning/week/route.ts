export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { PLANNING_ROLES, loadPlanningWeek } from "@/lib/ops-control/planning-service";
import { operationalToday } from "@/lib/ops-control/inventory-service";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/ops-control/planning/week[?week_start=YYYY-MM-DD][&horizon=28]
 *
 * The whole planning week in one read: the production grid, the delivery
 * commitments it has to serve, and the assessment of whether it does.
 *
 * Any date inside a week resolves to that week's Saturday, so a caller never
 * has to know where the boundary falls.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, PLANNING_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { week_start, horizon } = parseQuery(request);
    if (week_start && !DATE_ONLY.test(week_start)) {
      return error("week_start must be a YYYY-MM-DD date", 400);
    }
    const horizonDays = horizon ? Number(horizon) : 28;
    if (!Number.isFinite(horizonDays) || horizonDays < 0 || horizonDays > 180) {
      return error("horizon must be between 0 and 180 days", 400);
    }
    return success(
      await loadPlanningWeek(week_start || operationalToday(), horizonDays),
    );
  } catch (err) {
    console.error("[OpsControl] planning week GET failed:", err);
    return error("Failed to load the planning week", 500);
  }
}
