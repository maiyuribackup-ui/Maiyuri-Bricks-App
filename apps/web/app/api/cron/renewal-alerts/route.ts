export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";

const CRON_SECRET = process.env.CRON_SECRET;

const CATEGORY_ICON: Record<string, string> = {
  insurance: "🛡️",
  tax: "🧾",
  license: "📜",
  vehicle: "🚛",
  amc: "🔧",
  other: "📌",
};

/**
 * POST /api/cron/renewal-alerts — Telegram ping for compliance renewals.
 * Fires for anything OVERDUE, and at the 7/3/1/0-days-left marks (plus the
 * item's own remind_days_before mark) so the register can't be forgotten.
 * The task generator separately creates approval-gated work items; this is
 * the loud channel the founder actually watches.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    const { data: rows, error: dbErr } = await supabaseAdmin
      .from("compliance_renewals")
      .select("name, category, due_date, remind_days_before, status")
      .eq("status", "active")
      .order("due_date");
    if (dbErr) return error("Failed to load renewals", 500);

    const todayIST = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const today = Date.parse(todayIST);

    const overdue: string[] = [];
    const dueSoon: string[] = [];
    for (const r of rows ?? []) {
      const daysLeft = Math.round((Date.parse(r.due_date) - today) / 86_400_000);
      const icon = CATEGORY_ICON[r.category] ?? "📌";
      if (daysLeft < 0) {
        overdue.push(`${icon} <b>${r.name}</b> — ${-daysLeft}d OVERDUE (${r.due_date})`);
      } else if (
        daysLeft === 0 ||
        daysLeft === 1 ||
        daysLeft === 3 ||
        daysLeft === 7 ||
        daysLeft === r.remind_days_before
      ) {
        dueSoon.push(
          `${icon} <b>${r.name}</b> — due in ${daysLeft}d (${r.due_date})`,
        );
      }
    }

    if (!overdue.length && !dueSoon.length) {
      return success({ sent: false, reason: "nothing due at alert marks" });
    }

    const lines = ["📋 <b>Renewals & Compliance</b>"];
    if (overdue.length) lines.push("", "🚨 <b>Overdue</b>", ...overdue);
    if (dueSoon.length) lines.push("", "⏳ <b>Coming up</b>", ...dueSoon);
    lines.push("", "Manage: mb.maiyuri.com/onehub → Renewals");

    const result = await sendTelegramMessage(lines.join("\n"));
    return success({
      sent: result.success,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
    });
  } catch (err) {
    console.error("[RenewalAlerts] failed:", err);
    return error(err instanceof Error ? err.message : "Renewal alerts failed", 500);
  }
}
