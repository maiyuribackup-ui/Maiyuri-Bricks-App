export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isFcmConfigured, sendPushToUsers } from "@/lib/push/fcm";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/my-work/digest — morning per-person work summary (cron).
 * "☀️ You have N tasks today (M overdue)" → deep-links to My Work.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    if (!isFcmConfigured()) return success({ sent: 0, reason: "FCM not configured" });

    // End of "today" in IST — anything due before this counts as today's load.
    const todayIST = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const endOfDayUtc = new Date(`${todayIST}T23:59:59.999+05:30`).toISOString();
    const nowUtc = new Date().toISOString();

    const { data: open, error: dbErr } = await supabaseAdmin
      .from("work_items")
      .select("assigned_user_id, due_at")
      .in("status", ["pending", "in_progress", "returned"])
      .or(`due_at.lte.${endOfDayUtc},due_at.is.null`)
      .limit(1000);
    if (dbErr) return error("Failed to load work items", 500);

    const byUser = new Map<string, { total: number; overdue: number }>();
    for (const row of open ?? []) {
      const cur = byUser.get(row.assigned_user_id) ?? { total: 0, overdue: 0 };
      cur.total += 1;
      if (row.due_at && row.due_at < nowUtc) cur.overdue += 1;
      byUser.set(row.assigned_user_id, cur);
    }

    let sent = 0;
    for (const [userId, counts] of byUser) {
      const body =
        counts.overdue > 0
          ? `${counts.total} task${counts.total === 1 ? "" : "s"} today — ${counts.overdue} overdue`
          : `${counts.total} task${counts.total === 1 ? "" : "s"} on your list today`;
      const res = await sendPushToUsers([userId], {
        title: "☀️ Your work today",
        body,
        data: { url: "/onehub/my-work" },
      });
      sent += res.sent;
    }
    return success({ users: byUser.size, sent });
  } catch (err) {
    console.error("[MyWork] digest failed:", err);
    return error("Digest failed", 500);
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
