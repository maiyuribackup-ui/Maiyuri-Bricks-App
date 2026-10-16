export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { pullDeliveriesFromOdoo } from "@/lib/delivery-service";
import { startCronLog } from "@/lib/health/cron-logger";
import { filterByPushPref, sendPushToUser } from "@/lib/push/fcm";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * After the morning sync, tell each driver what their day looks like.
 * Lean policy: one push per driver per run, only when they actually have
 * deliveries scheduled today, and only if they haven't opted out (push_ops).
 * Best-effort — a push failure must never fail the sync cron.
 */
async function notifyDriversOfTodaysDeliveries(): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: rows } = await supabaseAdmin
      .from("deliveries")
      .select("assigned_driver_id")
      .gte("scheduled_date", `${today}T00:00:00`)
      .lte("scheduled_date", `${today}T23:59:59`)
      .not("assigned_driver_id", "is", null)
      .not("status", "in", "(delivered,cancelled)");

    const counts = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row.assigned_driver_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (counts.size === 0) return;

    const allowed = new Set(
      await filterByPushPref([...counts.keys()], "push_ops"),
    );
    for (const [driverId, count] of counts) {
      if (!allowed.has(driverId)) continue;
      await sendPushToUser(driverId, {
        title: `🚚 ${count} deliver${count === 1 ? "y" : "ies"} scheduled today`,
        body: "Open the app for addresses and customer contacts.",
        data: { url: "/deliveries" },
      });
    }
  } catch (err) {
    console.error("Driver delivery push failed:", err);
  }
}

// Vercel Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/deliveries/cron - Scheduled sync from Odoo
// Configured in vercel.json to run every 5 minutes
export async function POST(request: NextRequest) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }

  const cronLog = await startCronLog("delivery-sync");

  try {
    // Sync deliveries from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

    const result = await pullDeliveriesFromOdoo(dateFrom);

    if (!result.success) {
      console.error("Cron sync failed:", result.error);
      await cronLog.fail(result.message);
      return error(result.message, 500);
    }

    console.log("Cron sync completed:", result.data);
    await cronLog.success();

    // Morning driver briefing (best-effort, after a successful sync).
    await notifyDriversOfTodaysDeliveries();

    return success(result.data);
  } catch (err) {
    console.error("Error in POST /api/deliveries/cron:", err);
    await cronLog.fail(err instanceof Error ? err.message : "Internal server error");
    return error("Internal server error", 500);
  }
}

// GET handler for manual trigger and Vercel Cron
export async function GET(request: NextRequest) {
  return POST(request);
}
