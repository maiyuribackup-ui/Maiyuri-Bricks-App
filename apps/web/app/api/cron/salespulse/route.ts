export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { sendTelegramMessage } from "@/lib/telegram";

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://mb.maiyuri.com";

/**
 * POST /api/cron/salespulse?window=daily|weekly
 *
 * Self-contained SalesPulse digest. Previously an external scheduled agent
 * composed and relayed the digest via /api/salespulse/send — when that agent
 * silently stopped, the digest stopped with it. This cron pulls the same
 * metrics endpoint internally and formats a deterministic digest, so the
 * only dependency is GitHub Actions (which alerts on failure).
 */

type Metrics = {
  window: string;
  pipeline_funnel: Record<string, number>;
  status_snapshot: Record<string, number>;
  new_leads: { current: number; previous: number };
  conversions: { current: number; previous: number; lost_current: number };
  pipeline_value: { quoted_total_active: number; won_in_window: number };
  stale_hot_leads: { name?: string; days_stale?: number }[];
  overdue_followups: { count: number; sample: { name?: string }[] };
  lead_sources_in_window: Record<string, number>;
  objections_active: Record<string, number>;
  scores: { avg_momentum: number | null; avg_ai_score: number | null };
  staff_performance?: Record<
    string,
    { open?: number; overdue?: number; won_in_window?: number }
  >;
};

const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

function trend(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? "🆕" : "—";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 5) return `📈 +${pct}%`;
  if (pct < -5) return `📉 ${pct}%`;
  return "➡️ flat";
}

function compose(m: Metrics, window: "daily" | "weekly"): string {
  const lines: string[] = [];
  lines.push(
    window === "weekly"
      ? "📊 <b>SalesPulse — Weekly</b>"
      : "📊 <b>SalesPulse — Daily</b>",
  );
  lines.push("");

  lines.push(
    `🆕 New leads: <b>${m.new_leads.current}</b> (${trend(m.new_leads.current, m.new_leads.previous)})`,
  );
  lines.push(
    `🏆 Won: <b>${m.conversions.current}</b> (${trend(m.conversions.current, m.conversions.previous)})` +
      (m.conversions.lost_current ? ` · lost ${m.conversions.lost_current}` : ""),
  );
  lines.push(
    `💰 Pipeline (quoted, active): <b>₹${inr(m.pipeline_value.quoted_total_active)}</b>` +
      (m.pipeline_value.won_in_window
        ? ` · won ₹${inr(m.pipeline_value.won_in_window)}`
        : ""),
  );

  // Funnel one-liner: only non-zero stages, in order.
  const funnel = Object.entries(m.pipeline_funnel)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(" → ");
  if (funnel) {
    lines.push("");
    lines.push(`🔻 Funnel: ${funnel}`);
  }

  // Action section — the part someone should DO something about.
  const actions: string[] = [];
  if (m.overdue_followups.count > 0) {
    const names = m.overdue_followups.sample
      .map((s) => s.name)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    actions.push(
      `⏰ <b>${m.overdue_followups.count} overdue follow-ups</b>${names ? ` — ${names}${m.overdue_followups.count > 4 ? "…" : ""}` : ""}`,
    );
  }
  if (m.stale_hot_leads.length > 0) {
    const hot = m.stale_hot_leads
      .slice(0, 3)
      .map((h) => `${h.name ?? "?"}${h.days_stale ? ` (${h.days_stale}d)` : ""}`)
      .join(", ");
    actions.push(`🔥 <b>Hot leads going cold:</b> ${hot}`);
  }
  if (actions.length) {
    lines.push("");
    lines.push("<b>Do today:</b>");
    lines.push(...actions);
  }

  // topN in the metrics route emits a Record, already sorted by count desc.
  const objections = Object.entries(m.objections_active ?? {}).slice(0, 3);
  if (objections.length) {
    lines.push("");
    lines.push(
      `🗣️ Top objections: ${objections.map(([o, c]) => `${o} (${c})`).join(", ")}`,
    );
  }

  const sources = Object.entries(m.lead_sources_in_window ?? {}).filter(
    ([, v]) => v > 0,
  );
  if (sources.length) {
    lines.push(
      `📣 Sources: ${sources.map(([s, c]) => `${s} ${c}`).join(", ")}`,
    );
  }

  lines.push("");
  lines.push(`Leads: ${APP_URL}/leads · Quotes: ${APP_URL}/quotes`);
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    const salespulseToken = process.env.SALESPULSE_TOKEN;
    if (!salespulseToken) {
      return error("SALESPULSE_TOKEN not configured", 500);
    }
    const window =
      request.nextUrl.searchParams.get("window") === "weekly"
        ? ("weekly" as const)
        : ("daily" as const);

    // Reuse the existing gatherer (same process on Vercel; the token never
    // leaves the server).
    const res = await fetch(
      `${APP_URL}/api/salespulse/metrics?window=${window}`,
      { headers: { Authorization: `Bearer ${salespulseToken}` }, cache: "no-store" },
    );
    if (!res.ok) {
      return error(`Metrics fetch failed (${res.status})`, 502);
    }
    const metrics = (await res.json()) as Metrics;

    const text = compose(metrics, window);
    const result = await sendTelegramMessage(text);
    return success({
      sent: result.success,
      window,
      new_leads: metrics.new_leads.current,
      overdue: metrics.overdue_followups.count,
    });
  } catch (err) {
    console.error("[SalesPulse cron] failed:", err);
    return error(err instanceof Error ? err.message : "SalesPulse failed", 500);
  }
}
