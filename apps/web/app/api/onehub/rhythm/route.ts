export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import {
  filterByPushPref,
  getUserIdsByRoles,
  sendPushToUsers,
} from "@/lib/push/fcm";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/onehub/rhythm — daily operating-rhythm reminder (18:00 IST via
 * GitHub Action): nudge accounts/leadership to close the day in Odoo.
 * Part of the OneHub "Daily Reminders" discipline. Skips Sundays.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }

  try {
    const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
    if (istNow.getUTCDay() === 0) return success({ sent: 0, reason: "Sunday" });

    const staff = await getUserIdsByRoles(["accountant", "founder", "owner"]);
    const recipients = await filterByPushPref(staff, "push_ops");
    if (!recipients.length) return success({ sent: 0, reason: "no recipients" });

    const res = await sendPushToUsers(recipients, {
      title: "🧾 Close the day in Odoo",
      body: "Update today's expenses, payments and sales entries before end of day.",
      data: { url: "/onehub" },
    });
    return success({ sent: res.sent, failed: res.failed });
  } catch (err) {
    console.error("rhythm reminder failed:", err);
    return error("Rhythm reminder failed", 500);
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
