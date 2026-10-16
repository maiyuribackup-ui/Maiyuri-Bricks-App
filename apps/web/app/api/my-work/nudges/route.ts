export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  notifyEveningChaser,
  notifyWorkEscalated,
  notifyWorkNudge,
} from "@/lib/my-work-notify";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * POST /api/my-work/nudges?mode=nag|evening|scorecard — the accountability
 * engine (GitHub Actions cron, Bearer CRON_SECRET).
 *
 *  • nag       — every ~2h in work hours: re-push every open item due today or
 *                overdue until the assignee acts (SR2). Items >4h overdue get
 *                escalated ONCE to founder/owner + Telegram (SR3).
 *  • evening   — 6pm IST: one "not finished today" summary per assignee (SR4).
 *  • scorecard — Monday 8am IST: 7-day completion % per staffer → Telegram (SR5).
 */
const CRON_SECRET = process.env.CRON_SECRET;

const OPEN_STATUSES = ["pending", "in_progress", "returned"];
const NAG_COOLDOWN_MS = 90 * 60 * 1000; // don't re-nag within 90 min
const ESCALATE_AFTER_MS = 4 * 60 * 60 * 1000; // boss hears after 4h overdue
const NAG_QUERY_LIMIT = 30; // bound each cron invocation; later runs pick up the rest
const MAX_NAG_NOTIFICATIONS_PER_RUN = 10;
const MAX_ESCALATIONS_PER_RUN = 3;
const RUN_TIME_BUDGET_MS = 45_000; // stay below Vercel/GitHub timeout ceilings

import type { WorkItemStatus } from "@maiyuri/shared";

type Row = {
  id: string;
  title: string;
  status: WorkItemStatus;
  assigned_user_id: string;
  due_at: string | null;
  last_nudged_at: string | null;
  nudge_count: number;
  escalated_at: string | null;
};

/** End of the current IST day, as a UTC ISO string. */
function istEndOfToday(): string {
  const istDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  return new Date(`${istDate}T23:59:59.999+05:30`).toISOString();
}

async function openItemsDueToday(): Promise<Row[]> {
  const { data, error: qErr } = await supabaseAdmin
    .from("work_items")
    .select(
      "id, title, status, assigned_user_id, due_at, last_nudged_at, nudge_count, escalated_at",
    )
    .in("status", OPEN_STATUSES)
    .not("due_at", "is", null)
    .lte("due_at", istEndOfToday())
    .order("due_at", { ascending: true })
    .limit(NAG_QUERY_LIMIT);
  if (qErr) throw new Error(`work_items query failed: ${qErr.message}`);
  return (data ?? []) as Row[];
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .in("id", ids);
  return new Map((data ?? []).map((u) => [u.id as string, u.name as string]));
}

async function runNag(): Promise<{
  nudged: number;
  escalated: number;
  skipped: number;
  fetched: number;
  capped: boolean;
}> {
  const started = Date.now();
  const items = await openItemsDueToday();
  const now = Date.now();
  let nudged = 0;
  let escalated = 0;
  let skipped = 0;

  const names = await userNames([
    ...new Set(items.map((i) => i.assigned_user_id)),
  ]);

  for (const item of items) {
    if (Date.now() - started > RUN_TIME_BUDGET_MS) {
      skipped += 1;
      continue;
    }

    const overdueMs = item.due_at ? now - new Date(item.due_at).getTime() : 0;

    // SR3 — one-time escalation to management once it's badly overdue.
    if (
      overdueMs > ESCALATE_AFTER_MS &&
      !item.escalated_at &&
      escalated < MAX_ESCALATIONS_PER_RUN
    ) {
      await notifyWorkEscalated(
        item,
        names.get(item.assigned_user_id) ?? "A team member",
        Math.floor(overdueMs / 3_600_000),
      );
      void sendTelegramMessage(
        `🚨 Work escalation: ${names.get(item.assigned_user_id) ?? "?"} — "${item.title}" is ${Math.floor(overdueMs / 3_600_000)}h overdue and not done.`,
      );
      await supabaseAdmin
        .from("work_items")
        .update({ escalated_at: new Date().toISOString() })
        .eq("id", item.id);
      escalated += 1;
    }

    // SR2 — repeating nag, capped so a backlog never blows the serverless limit.
    const last = item.last_nudged_at
      ? new Date(item.last_nudged_at).getTime()
      : 0;
    if (now - last < NAG_COOLDOWN_MS) continue;
    if (nudged >= MAX_NAG_NOTIFICATIONS_PER_RUN) {
      skipped += 1;
      continue;
    }

    await notifyWorkNudge(item, item.nudge_count + 1, overdueMs > 0);
    await supabaseAdmin
      .from("work_items")
      .update({
        last_nudged_at: new Date().toISOString(),
        nudge_count: item.nudge_count + 1,
      })
      .eq("id", item.id);
    nudged += 1;
  }

  return {
    nudged,
    escalated,
    skipped,
    fetched: items.length,
    capped: items.length >= NAG_QUERY_LIMIT || skipped > 0,
  };
}

async function runEvening(): Promise<{ users: number }> {
  const items = await openItemsDueToday();
  const byUser = new Map<string, string[]>();
  for (const i of items) {
    const arr = byUser.get(i.assigned_user_id) ?? [];
    arr.push(i.title);
    byUser.set(i.assigned_user_id, arr);
  }
  for (const [userId, titles] of byUser) {
    await notifyEveningChaser(userId, titles);
  }
  return { users: byUser.size };
}

async function runScorecard(): Promise<{ staff: number }> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error: qErr } = await supabaseAdmin
    .from("work_items")
    .select("assigned_user_id, status, due_at, completed_at, created_at")
    .gte("created_at", since);
  if (qErr) throw new Error(`scorecard query failed: ${qErr.message}`);

  type Tally = { total: number; done: number; overdueOpen: number };
  const byUser = new Map<string, Tally>();
  const now = Date.now();
  for (const w of data ?? []) {
    const t = byUser.get(w.assigned_user_id) ?? {
      total: 0,
      done: 0,
      overdueOpen: 0,
    };
    t.total += 1;
    if (w.status === "completed" || w.status === "approved") t.done += 1;
    else if (
      OPEN_STATUSES.includes(w.status) &&
      w.due_at &&
      new Date(w.due_at).getTime() < now
    ) {
      t.overdueOpen += 1;
    }
    byUser.set(w.assigned_user_id, t);
  }
  if (!byUser.size) return { staff: 0 };

  const names = await userNames([...byUser.keys()]);
  const rows = [...byUser.entries()]
    .map(([id, t]) => ({
      name: names.get(id) ?? "?",
      pct: t.total ? Math.round((t.done / t.total) * 100) : 0,
      ...t,
    }))
    .sort((a, b) => b.pct - a.pct);

  const lines = rows.map(
    (r, i) =>
      `${i + 1}. ${r.name} — ${r.done}/${r.total} done (${r.pct}%)${r.overdueOpen ? ` · ⚠️ ${r.overdueOpen} overdue open` : ""}`,
  );
  await sendTelegramMessage(
    `📊 Weekly Work Scorecard (last 7 days)\n${lines.join("\n")}`,
  );
  return { staff: rows.length };
}

export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }

  const mode = new URL(request.url).searchParams.get("mode") ?? "nag";
  try {
    if (mode === "nag") return success(await runNag());
    if (mode === "evening") return success(await runEvening());
    if (mode === "scorecard") return success(await runScorecard());
    return error(`Unknown mode: ${mode}`, 400);
  } catch (err) {
    console.error(`[MyWork] nudges mode=${mode} failed:`, err);
    return error("Nudge run failed", 500);
  }
}
