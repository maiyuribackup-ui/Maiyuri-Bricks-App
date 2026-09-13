export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  filterByPushPref,
  getUserIdsByRoles,
  sendPushToUsers,
  sendPushToUser,
} from "@/lib/push/fcm";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST/GET /api/ops-planning/notify — the previous-night reminder.
 * Called by the plan-reminder GitHub Action at ~21:00 IST. Sends tomorrow's
 * plan summary to supervisors/leadership, and each driver their deliveries.
 * Lean policy: nothing sent when tomorrow has no plan items (e.g. Sundays).
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }

  try {
    const tomorrow = new Date(Date.now() + 5.5 * 3600 * 1000 + 86400000)
      .toISOString()
      .slice(0, 10);

    const { data: plan } = await supabaseAdmin
      .from("ops_plans")
      .select("id, name")
      .eq("status", "active")
      .maybeSingle();
    if (!plan) return success({ sent: 0, reason: "no active plan" });

    const { data: items } = await supabaseAdmin
      .from("ops_plan_items")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("item_date", tomorrow)
      .neq("status", "done");

    if (!items?.length) return success({ sent: 0, reason: "empty day" });

    const production = items.filter((i) => i.item_type === "production");
    const deliveries = items.filter((i) => i.item_type === "delivery");

    const prodSummary = production
      .map((i) => `${Number(i.quantity).toLocaleString("en-IN")}× ${i.product_name}`)
      .join(" · ");
    const delSummary = deliveries
      .map((i) => i.customer_name)
      .filter(Boolean)
      .join(", ");

    const bodyParts: string[] = [];
    if (production.length) bodyParts.push(`🏭 ${prodSummary}`);
    if (deliveries.length)
      bodyParts.push(`🚚 ${deliveries.length} deliver${deliveries.length === 1 ? "y" : "ies"}${delSummary ? ` (${delSummary})` : ""}`);

    // Leadership + supervisors get the whole picture.
    const staff = await getUserIdsByRoles([
      "founder",
      "owner",
      "production_supervisor",
    ]);
    const recipients = await filterByPushPref(staff, "push_ops");
    let sent = 0;
    if (recipients.length) {
      const res = await sendPushToUsers(recipients, {
        title: "📋 Tomorrow's plan",
        body: bodyParts.join("  |  "),
        data: { url: "/plan" },
      });
      sent += res.sent;
    }

    // Drivers: their own delivery count for tomorrow (from the live
    // deliveries table, which carries assignments).
    const { data: driverRows } = await supabaseAdmin
      .from("deliveries")
      .select("assigned_driver_id")
      .gte("scheduled_date", `${tomorrow}T00:00:00`)
      .lte("scheduled_date", `${tomorrow}T23:59:59`)
      .not("assigned_driver_id", "is", null)
      .not("status", "in", "(delivered,cancelled)");
    const counts = new Map<string, number>();
    for (const r of driverRows ?? []) {
      const id = r.assigned_driver_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const allowedDrivers = new Set(
      await filterByPushPref([...counts.keys()], "push_ops"),
    );
    for (const [driverId, count] of counts) {
      if (!allowedDrivers.has(driverId)) continue;
      const res = await sendPushToUser(driverId, {
        title: `🚚 ${count} deliver${count === 1 ? "y" : "ies"} tomorrow`,
        body: "Check addresses tonight — plan your route.",
        data: { url: "/deliveries" },
      });
      sent += res.sent;
    }

    return success({ sent, date: tomorrow, items: items.length });
  } catch (err) {
    console.error("plan notify failed:", err);
    return error("Plan notification failed", 500);
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
