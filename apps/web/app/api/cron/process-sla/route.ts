export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { dispatchDueDeliveries } from "@/lib/process/events";
import { runSlaSweep } from "@/lib/process/sla";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/process-sla — hourly SLA sweep (PRD §9, §15). Marks
 * warnings / breaches idempotently in the database and dispatches the
 * resulting events (push / Telegram / webhook), then drains any event
 * deliveries that are due for retry (failed earlier, or left leased by a
 * crashed worker). Driven by .github/workflows/process-sla.yml.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    const result = await runSlaSweep();
    const drain = await dispatchDueDeliveries();
    return success({
      warnings: result.warnings,
      breaches: result.breaches,
      dispatched: result.dispatched,
      retried: drain,
    });
  } catch (err) {
    console.error("[ProcessSLA] failed:", err);
    return error(err instanceof Error ? err.message : "SLA sweep failed", 500);
  }
}
