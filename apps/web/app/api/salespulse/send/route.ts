/**
 * POST /api/salespulse/send
 *
 * Token-gated relay that posts a composed digest to the team Telegram chat.
 * Keeps the Telegram bot token server-side: callers (e.g. a scheduled remote
 * agent) hold only the scoped SALESPULSE_TOKEN, never the bot token or chat id.
 *
 * Body: { "text": "<telegram markdown>", "chat_id"?: "<override>" }
 * Auth: Authorization: Bearer <SALESPULSE_TOKEN>
 *
 * Long messages are split on line boundaries under Telegram's 4096-char cap.
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendPushToUsers } from "@/lib/push/fcm";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { error, unauthorized, handleZodError, success } from "@/lib/api-utils";

const TG_LIMIT = 4000;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(20000),
  chat_id: z.string().trim().optional(),
  // Opt-in native push to leadership alongside the Telegram relay. The relay is
  // generic (ad-hoc messages too), so push only fires when the caller asks for
  // it — e.g. the daily owner summary sets this.
  push: z
    .object({
      title: z.string().trim().min(1).max(100),
      body: z.string().trim().min(1).max(240),
      url: z.string().trim().optional(),
      roles: z.array(z.string().trim()).optional(),
    })
    .optional(),
});

function chunk(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (buf.length + line.length + 1 > size) {
      if (buf) parts.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

export async function POST(request: NextRequest) {
  const expected = process.env.SALESPULSE_TOKEN;
  if (!expected) {
    return error("SALESPULSE_TOKEN not configured on server", 500);
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== expected) {
    return unauthorized("Invalid or missing SalesPulse token");
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  // Default target = the team group (TELEGRAM_CHAT_ID); allow explicit override.
  const targetChatId = parsed.data.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!targetChatId) {
    return error("No target chat id configured (TELEGRAM_CHAT_ID)", 500);
  }

  const parts = chunk(parsed.data.text, TG_LIMIT);
  const results: { part: number; ok: boolean; error?: string }[] = [];
  let allOk = true;
  for (let i = 0; i < parts.length; i++) {
    const res = await sendTelegramMessage(parts[i], targetChatId);
    if (!res.success) allOk = false;
    results.push({ part: i + 1, ok: res.success, error: res.error });
  }

  if (!allOk) {
    return error(`Telegram send failed: ${JSON.stringify(results)}`, 502);
  }

  // Opt-in native push to leadership (best-effort; never fails the relay).
  let pushSent = 0;
  if (parsed.data.push) {
    const { title, body, url, roles } = parsed.data.push;
    const targetRoles = roles && roles.length > 0 ? roles : ["founder", "owner"];
    try {
      const { data: recipients } = await supabaseAdmin
        .from("users")
        .select("id")
        .in("role", targetRoles);
      const recipientIds = (recipients ?? []).map((u) => u.id);
      const r = await sendPushToUsers(recipientIds, { title, body, data: { url: url || "/dashboard" } });
      pushSent = r.sent;
    } catch (err) {
      console.error("[SalesPulse] Push dispatch failed:", err);
    }
  }

  return success({
    sent: true,
    parts: parts.length,
    chat_id: targetChatId,
    push_sent: pushSent,
  });
}
