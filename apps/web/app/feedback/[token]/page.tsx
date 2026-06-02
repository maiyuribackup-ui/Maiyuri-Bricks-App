/**
 * /feedback/[token] — public, token-gated feedback page.
 *
 * Server component: looks up the lead via supabaseAdmin (same query as the
 * Phase 2 GET API, but inline to avoid an extra hop), shapes the
 * personalisation payload, and hands it to the client survey component.
 *
 * No auth — the token is the gate. 404 on unknown / disabled tokens.
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 3b)
 */

import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FactoryFeedbackSurvey,
  type LeadContext,
} from "@/components/feedback/factory-feedback-survey";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-HJ-NP-Z2-9]{10}$/;

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function asStringArray(jsonb: unknown): string[] {
  if (!Array.isArray(jsonb)) return [];
  return jsonb.filter((v): v is string => typeof v === "string");
}

async function loadContext(token: string): Promise<LeadContext | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, contact, language_preference, lead_type, lead_status, next_action")
    .eq("feedback_token", token)
    .maybeSingle();

  if (!lead) return null;

  const { data: noteRow } = await supabaseAdmin
    .from("notes")
    .select("ai_summary, text, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest_note_summary =
    noteRow?.ai_summary ?? (noteRow?.text ? noteRow.text.slice(0, 240) : null);

  const { data: chainRow } = await supabaseAdmin
    .from("conversation_chains")
    .select("unresolved_objections, unfulfilled_promises, buying_stage_progression, last_contact_at")
    .eq("lead_id", lead.id)
    .order("last_contact_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stages = chainRow?.buying_stage_progression;
  const recent_buying_stage =
    Array.isArray(stages) && stages.length > 0 ? stages[stages.length - 1] : null;

  return {
    lead: {
      name: lead.name,
      first_name: firstName(lead.name),
      contact: lead.contact,
      language_preference: (lead.language_preference as "en" | "ta") ?? "en",
      lead_type: lead.lead_type ?? null,
      status: lead.lead_status ?? null,
      current_next_action: lead.next_action ?? null,
    },
    context: {
      latest_note_summary,
      unresolved_objections: asStringArray(chainRow?.unresolved_objections),
      unfulfilled_promises: asStringArray(chainRow?.unfulfilled_promises),
      recent_buying_stage,
      last_contact_at: chainRow?.last_contact_at ?? null,
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { title: "Feedback — Maiyuri Bricks" };
  const ctx = await loadContext(token);
  return {
    title: ctx ? `${ctx.lead.first_name} · Factory feedback — Maiyuri Bricks` : "Feedback — Maiyuri Bricks",
    description: "Share your factory-visit feedback with the Maiyuri Bricks team.",
    robots: { index: false, follow: false },
  };
}

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const ctx = await loadContext(token);
  if (!ctx) notFound();

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Noto+Serif+Tamil:wght@500;600&display=swap"
      />
      <FactoryFeedbackSurvey token={token} context={ctx} />
    </>
  );
}
