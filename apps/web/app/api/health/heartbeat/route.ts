export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { GEMINI_MODEL } from "@/lib/ai/models";

/**
 * GET/POST /api/health/heartbeat — the app-side half of the daily heartbeat
 * (CRON_SECRET bearer). Checks the DATA plane: is Odoo data fresh, is the
 * Gemini key alive (the silent-quota-death check), are recordings flowing,
 * is the work engine generating. The GitHub workflow half checks the CONTROL
 * plane (deploy status, cron run conclusions) and composes the one daily
 * Telegram message from both.
 *
 * Design rule: every check is isolated and returns ok/warn/fail + a short
 * human line — a broken check reports itself, it never breaks the heartbeat.
 */
const CRON_SECRET = process.env.CRON_SECRET;

type Check = { ok: boolean; line: string };

const hoursAgo = (iso: string | null): number | null =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000) : null;

async function checkOdooFreshness(): Promise<Check> {
  try {
    const [{ data: order }, { data: good }] = await Promise.all([
      supabaseAdmin
        .from("sales_order_cache")
        .select("synced_at")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("finished_goods")
        .select("stock_synced_at")
        .not("stock_synced_at", "is", null)
        .order("stock_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const ordersH = hoursAgo((order?.synced_at as string) ?? null);
    const stockH = hoursAgo((good?.stock_synced_at as string) ?? null);
    // Nightly sync + manual syncs → anything beyond ~30h means the sync died.
    const ok = ordersH != null && ordersH <= 30 && stockH != null && stockH <= 30;
    return {
      ok,
      line: `Odoo data: orders ${ordersH ?? "?"}h · stock ${stockH ?? "?"}h ago`,
    };
  } catch (e) {
    return { ok: false, line: `Odoo data check failed: ${String(e).slice(0, 80)}` };
  }
}

async function checkGemini(): Promise<Check> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { ok: false, line: "Gemini: no API key configured" };
  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: GEMINI_MODEL.FLASH_LITE,
      generationConfig: { maxOutputTokens: 5 },
    });
    await model.generateContent("Reply with: ok");
    return { ok: true, line: "Gemini AI: live" };
  } catch (e) {
    // The exact failure that silently killed transcription on 2026-07-19
    // (429 prepaid balance exhausted) — surface the reason loudly.
    return { ok: false, line: `Gemini AI DOWN: ${String(e).slice(0, 120)}` };
  }
}

async function checkRecordings(): Promise<Check> {
  try {
    const dayStart = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const [{ count: processed }, { count: stuck }] = await Promise.all([
      supabaseAdmin
        .from("call_recordings")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "completed")
        .gte("updated_at", dayStart),
      supabaseAdmin
        .from("call_recordings")
        .select("id", { count: "exact", head: true })
        .in("processing_status", ["pending", "failed"]),
    ]);
    // Stuck items are only a warning-level failure if they exist at all —
    // the nightly run should drain the queue.
    return {
      ok: (stuck ?? 0) === 0,
      line: `Recordings: ${processed ?? 0} processed / 24h · ${stuck ?? 0} stuck`,
    };
  } catch (e) {
    return { ok: false, line: `Recordings check failed: ${String(e).slice(0, 80)}` };
  }
}

async function checkWorkEngine(): Promise<Check> {
  try {
    const istToday = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const [{ count: generated }, { count: overdue }] = await Promise.all([
      supabaseAdmin
        .from("work_items")
        .select("id", { count: "exact", head: true })
        .eq("scheduled_date", istToday)
        .not("template_id", "is", null),
      supabaseAdmin
        .from("work_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress", "returned"])
        .lt("due_at", new Date().toISOString()),
    ]);
    // Generation count of 0 is legitimate on days with no recurring templates
    // due — treat as informational, not failure. Overdue is an ops pulse.
    return {
      ok: true,
      line: `Work: ${generated ?? 0} generated today · ${overdue ?? 0} overdue open`,
    };
  } catch (e) {
    return { ok: false, line: `Work check failed: ${String(e).slice(0, 80)}` };
  }
}

async function heartbeat() {
  const [odoo, gemini, recordings, work] = await Promise.all([
    checkOdooFreshness(),
    checkGemini(),
    checkRecordings(),
    checkWorkEngine(),
  ]);
  const checks = { odoo, gemini, recordings, work };
  return {
    all_ok: Object.values(checks).every((c) => c.ok),
    checks,
    generated_at: new Date().toISOString(),
  };
}

async function handle(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    return success(await heartbeat());
  } catch (err) {
    console.error("[Heartbeat] failed:", err);
    return error("Heartbeat failed", 500);
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
