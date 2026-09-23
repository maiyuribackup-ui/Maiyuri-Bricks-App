export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { routes } from "@maiyuri/api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isWhatsAppConfigured,
  sendWhatsAppText,
  toWaNumber,
  logWhatsAppMessage,
} from "@/lib/whatsapp";
import { createFirstResponseTask } from "@/lib/golden-hour";
import { notifyLeadPush, getUserIdsByRoles, filterByPushPref } from "@/lib/push/fcm";

/**
 * WhatsApp AI Concierge webhook.
 *   GET  — Meta verification handshake (hub.challenge).
 *   POST — inbound customer messages: log → find/create lead → AI reply from
 *          the Ask-Mayur knowledge base → buying-intent hand-off to the rep.
 *
 * Public (Meta calls it unauthenticated); the verify token is the gate on GET,
 * and POST is idempotent + best-effort. No-ops entirely until configured.
 */

// GET: webhook verification
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WaInbound = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id: string }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body: string };
        }[];
      };
    }[];
  }[];
};

// Keywords that signal buying intent → hand off to a human immediately.
const HANDOFF_RE =
  /\b(price|quote|rate|order|buy|purchase|delivery|visit|book|discount|வில|விலை|ஆர்டர்|கோட்)/i;

export async function POST(request: NextRequest) {
  // Always 200 fast so Meta doesn't retry-storm; work happens inline but
  // wrapped so a failure still returns 200.
  try {
    if (!isWhatsAppConfigured()) return NextResponse.json({ ok: true });

    const body = (await request.json()) as WaInbound;
    const change = body.entry?.[0]?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    if (!msg || msg.type !== "text" || !msg.text?.body) {
      return NextResponse.json({ ok: true });
    }

    const waPhone = toWaNumber(msg.from);
    const text = msg.text.body.trim();
    const profileName = change?.contacts?.[0]?.profile?.name ?? null;

    // Idempotency: Meta re-delivers; the unique wa_message_id blocks dupes.
    const { data: seen } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("wa_message_id", msg.id)
      .maybeSingle();
    if (seen) return NextResponse.json({ ok: true });

    // Find or create the lead by normalized phone (last 10 digits).
    const last10 = waPhone.slice(-10);
    let { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, assigned_staff")
      .ilike("contact", `%${last10}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let isNew = false;
    if (!lead) {
      const { data: created } = await supabaseAdmin
        .from("leads")
        .insert({
          name: profileName ?? last10,
          contact: last10,
          source: "WhatsApp",
          lead_status: "new_contact_pending",
          pipeline_stage: "new_inquiry",
          lead_type: "Other",
          classification: "direct_customer",
        })
        .select("id, name, assigned_staff")
        .single();
      lead = created ?? null;
      isNew = true;
      if (lead) await createFirstResponseTask({ ...lead, source: "WhatsApp" });
    }

    const handoff = HANDOFF_RE.test(text);

    await logWhatsAppMessage({
      lead_id: lead?.id ?? null,
      wa_phone: waPhone,
      direction: "inbound",
      body: text,
      wa_message_id: msg.id,
      handoff,
    });

    // AI reply from the Ask-Mayur knowledge base (Tamil/English).
    const isTamil = /[஀-௿]/.test(text);
    let answer =
      "Vanakkam! 🙏 Thank you for messaging Maiyuri Bricks. Our team will get back to you very shortly.";
    try {
      const result = await routes.knowledge.answerQuestion({
        question: text,
        leadId: lead?.id,
        includeNotes: false,
        maxSources: 4,
        language: isTamil ? "ta" : "en",
      });
      if (result.success && result.data?.answer) {
        answer = result.data.answer;
      }
    } catch (err) {
      console.error("[WhatsApp] RAG answer failed:", err);
    }

    if (handoff) {
      answer +=
        "\n\n" +
        (isTamil
          ? "எங்கள் விற்பனை நண்பர் விரைவில் உங்களை அழைப்பார். 📞"
          : "Our sales colleague will call you shortly to help further. 📞");
    }

    await sendWhatsAppText(waPhone, answer, {
      leadId: lead?.id ?? null,
      aiReplied: true,
    });

    // Buying intent (or brand-new WhatsApp lead) → put it in front of a human.
    if ((handoff || isNew) && lead) {
      await createFirstResponseTask({
        id: lead.id,
        name: lead.name,
        assigned_staff: (lead.assigned_staff as string | null) ?? null,
        source: "WhatsApp",
      });
      try {
        const leadership = await getUserIdsByRoles(["founder", "owner"]);
        const recipients = await filterByPushPref(leadership, "push_leads");
        await notifyLeadPush(recipients, {
          title: `💬 WhatsApp: ${lead.name ?? last10}`,
          body: text.slice(0, 160),
          leadId: lead.id,
        });
      } catch {
        /* push best-effort */
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp] webhook error (ignored):", err);
    return NextResponse.json({ ok: true });
  }
}
