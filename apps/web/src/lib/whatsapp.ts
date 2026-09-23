/**
 * WhatsApp Cloud API client for the AI Concierge.
 *
 * Dormant until three env vars are set (nothing sends without them):
 *   WHATSAPP_TOKEN          — permanent/system-user access token (Meta)
 *   WHATSAPP_PHONE_NUMBER_ID — the sending number's id
 *   WHATSAPP_VERIFY_TOKEN    — arbitrary string, matched on webhook verify
 *
 * All sends are logged to whatsapp_messages and best-effort (never throw).
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

const GRAPH = "https://graph.facebook.com/v21.0";

export function isWhatsAppConfigured(): boolean {
  return (
    !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

/** Digits only (Cloud API wants E.164 without '+', e.g. 919345971162). */
export function toWaNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  // Bare 10-digit Indian mobile → prefix 91.
  return d.length === 10 ? `91${d}` : d;
}

async function logMessage(row: {
  lead_id?: string | null;
  wa_phone: string;
  direction: "inbound" | "outbound";
  body?: string | null;
  wa_message_id?: string | null;
  ai_replied?: boolean;
  handoff?: boolean;
}): Promise<void> {
  try {
    await supabaseAdmin.from("whatsapp_messages").insert(row);
  } catch (err) {
    console.error("[WhatsApp] log failed (ignored):", err);
  }
}

/**
 * Send a free-form text message. Only works inside the 24-hour customer-service
 * window (i.e. the customer messaged us recently); outside it Meta requires an
 * approved template — see sendTemplate.
 */
export async function sendWhatsAppText(
  toPhone: string,
  body: string,
  opts: { leadId?: string | null; aiReplied?: boolean } = {},
): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  const to = toWaNumber(toPhone);
  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: body.slice(0, 4096), preview_url: true },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      console.error("[WhatsApp] send failed:", json.error?.message ?? res.status);
      return false;
    }
    await logMessage({
      lead_id: opts.leadId ?? null,
      wa_phone: to,
      direction: "outbound",
      body,
      wa_message_id: json.messages?.[0]?.id ?? null,
      ai_replied: opts.aiReplied ?? false,
    });
    return true;
  } catch (err) {
    console.error("[WhatsApp] send threw (ignored):", err);
    return false;
  }
}

/**
 * Send an approved template (for proactively reaching a NEW lead outside the
 * 24h window — the welcome/intro). Falls back silently if not configured or
 * the template name env isn't set.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  languageCode = "en",
  opts: { leadId?: string | null } = {},
): Promise<boolean> {
  if (!isWhatsAppConfigured() || !templateName) return false;
  const to = toWaNumber(toPhone);
  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: languageCode } },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      console.error(
        "[WhatsApp] template send failed:",
        json.error?.message ?? res.status,
      );
      return false;
    }
    await logMessage({
      lead_id: opts.leadId ?? null,
      wa_phone: to,
      direction: "outbound",
      body: `[template:${templateName}]`,
      wa_message_id: json.messages?.[0]?.id ?? null,
    });
    return true;
  } catch (err) {
    console.error("[WhatsApp] template threw (ignored):", err);
    return false;
  }
}

export { logMessage as logWhatsAppMessage };
