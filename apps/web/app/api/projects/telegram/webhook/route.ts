export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseDailyUpdate } from "@/lib/projects/ai/parse-update";
import { recomputeProject } from "@/lib/projects/recompute";

const BOT_TOKEN = process.env.PROJECTS_TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.PROJECTS_TELEGRAM_WEBHOOK_SECRET;
const CONFIDENCE_AUTO_SAVE = 0.7;

async function reply(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error("projects telegram reply error:", e);
  }
}

// POST — Telegram webhook for the dedicated Projects bot.
export async function POST(request: NextRequest) {
  try {
    // Secret-gate (Telegram echoes the secret we set via setWebhook).
    if (
      WEBHOOK_SECRET &&
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET
    ) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json();
    const message = update?.message;
    const text: string | undefined = message?.text;
    const chatId: number | undefined = message?.chat?.id;
    if (!message || !text || chatId == null) {
      return NextResponse.json({ ok: true }); // ignore non-text updates
    }

    // Active projects for matching.
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, name, telegram_chat_id")
      .not("status", "in", "(closed,cancelled)");
    const known = (projects || []).map((p: any) => ({ id: p.id, name: p.name }));

    // Resolve project: prefer a chat→project mapping, else AI name match.
    let projectId: string | null =
      (projects || []).find((p: any) => p.telegram_chat_id === String(chatId))?.id ?? null;

    const parsed = await parseDailyUpdate(text, known);

    if (!projectId && parsed.project_name) {
      const lc = parsed.project_name.toLowerCase();
      projectId =
        (projects || []).find(
          (p: any) =>
            p.name.toLowerCase() === lc ||
            p.name.toLowerCase().includes(lc) ||
            lc.includes(p.name.toLowerCase()),
        )?.id ?? null;
    }

    if (!projectId) {
      await reply(
        chatId,
        "Which project is this update for? Mention the project name (e.g. \"Kishore Redhills: produced 2200 bricks today\").",
      );
      return NextResponse.json({ ok: true });
    }

    const canSave =
      parsed.confidence >= CONFIDENCE_AUTO_SAVE &&
      typeof parsed.actual_quantity === "number" &&
      parsed.actual_quantity > 0;

    if (!canSave) {
      const understood = [
        parsed.actual_quantity ? `qty ${parsed.actual_quantity}` : null,
        parsed.labour_count ? `${parsed.labour_count} labour` : null,
        parsed.issue ? `issue: ${parsed.issue}` : null,
      ].filter(Boolean).join(", ");
      await reply(
        chatId,
        `I understood: ${understood || "not enough detail"}.\nPlease resend with today's quantity completed, labour, and any issue — e.g. "produced 2200 bricks, 5 labour, rain 2 hrs, tomorrow 2500".`,
      );
      return NextResponse.json({ ok: true });
    }

    // Match WBS by hint (optional).
    let wbsCode: string | null = null;
    if (parsed.wbs_hint) {
      const { data: wbs } = await supabaseAdmin
        .from("project_wbs_items")
        .select("code, name")
        .eq("project_id", projectId);
      const h = parsed.wbs_hint.toLowerCase();
      wbsCode = (wbs || []).find((w: any) => w.name.toLowerCase().includes(h))?.code ?? null;
    }

    await supabaseAdmin.from("daily_progress").insert({
      project_id: projectId,
      wbs_code: wbsCode,
      progress_date: new Date().toISOString().slice(0, 10),
      actual_quantity: parsed.actual_quantity,
      unit: parsed.unit,
      labour_count: parsed.labour_count,
      machine_hours: parsed.machine_hours,
      cost_mentioned: parsed.cost_mentioned,
      issue: parsed.issue,
      delay_reason: parsed.delay_reason,
      tomorrow_plan: parsed.tomorrow_plan,
      source: "telegram",
      ai_confidence: parsed.confidence,
    });

    // Advance WBS completion if matched.
    if (wbsCode) {
      const { data: w } = await supabaseAdmin
        .from("project_wbs_items")
        .select("id, completed_quantity, planned_quantity")
        .eq("project_id", projectId)
        .eq("code", wbsCode)
        .maybeSingle();
      if (w) {
        const completed = (Number(w.completed_quantity) || 0) + (parsed.actual_quantity || 0);
        const planned = Number(w.planned_quantity) || 0;
        const upd: Record<string, unknown> = { completed_quantity: completed, status: "in_progress" };
        if (planned > 0) {
          const pct = Math.min(100, Math.round((completed / planned) * 100));
          upd.progress_pct = pct;
          if (pct >= 100) upd.status = "completed";
        }
        await supabaseAdmin.from("project_wbs_items").update(upd).eq("id", w.id);
      }
    }

    await recomputeProject(projectId);
    const pName = known.find((p) => p.id === projectId)?.name ?? "project";
    await reply(
      chatId,
      `✅ Saved for ${pName}: ${parsed.actual_quantity} ${parsed.unit || "units"}${parsed.labour_count ? `, ${parsed.labour_count} labour` : ""}${parsed.issue ? `\n⚠ ${parsed.issue}` : ""}${parsed.tomorrow_plan ? `\nTomorrow: ${parsed.tomorrow_plan}` : ""}`,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("projects telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // never 500 to Telegram
  }
}

// GET — health/config check
export async function GET() {
  return NextResponse.json({ configured: Boolean(BOT_TOKEN && WEBHOOK_SECRET) });
}
