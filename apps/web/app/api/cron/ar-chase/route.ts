export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { fetchReceivables } from "@/lib/receivables";
import { sendTelegramMessage } from "@/lib/telegram";

const CRON_SECRET = process.env.CRON_SECRET;

const inr = (n: number) =>
  Math.round(n).toLocaleString("en-IN");

/**
 * POST /api/cron/ar-chase — the daily "collect your money" nudge.
 * Pulls overdue customer invoices from Odoo and posts a Telegram summary:
 * who owes what and how late they are. Silent when nothing is overdue.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    const ar = await fetchReceivables();

    if (ar.overdueCount === 0) {
      return success({
        sent: false,
        reason: "nothing overdue",
        outstanding: ar.outstanding,
      });
    }

    const lines = [
      `💰 <b>Money to collect — ₹${inr(ar.overdue)} overdue</b>`,
      `(${ar.overdueCount} invoices · ₹${inr(ar.outstanding)} total outstanding)`,
      "",
      ...ar.topDebtors.map(
        (d, i) =>
          `${i + 1}. <b>${d.customer}</b> — ₹${inr(d.due)} · oldest ${d.oldestDays}d late`,
      ),
    ];
    if (ar.overdueInvoices.length > ar.topDebtors.length) {
      lines.push("", `…full list in Odoo → Invoices → filter "Overdue".`);
    }

    const result = await sendTelegramMessage(lines.join("\n"));
    return success({
      sent: result.success,
      overdue: ar.overdue,
      overdueCount: ar.overdueCount,
      topDebtors: ar.topDebtors,
    });
  } catch (err) {
    console.error("[ARChase] failed:", err);
    return error(err instanceof Error ? err.message : "AR chase failed", 500);
  }
}
