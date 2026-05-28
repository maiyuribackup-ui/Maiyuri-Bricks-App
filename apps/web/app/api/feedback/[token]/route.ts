/**
 * GET /api/feedback/[token]
 *
 * Public, token-gated read endpoint that returns the minimal personalisation
 * payload for the /feedback/[token] page (tap form pre-fill + voice prompt
 * context). Token is the lead's `feedback_token` column.
 *
 * Returns ONLY what's needed for personalisation. Deliberately excludes
 * staff details, ai_score, financial fields, internal IDs.
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 2)
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound } from "@/lib/api-utils";

// Token alphabet matches gen_feedback_token() in the migration.
const TOKEN_RE = /^[A-HJ-NP-Z2-9]{10}$/;

type FeedbackContextResponse = {
  lead: {
    name: string;
    first_name: string;
    contact: string;
    language_preference: "en" | "ta";
    lead_type: string | null;
    status: string | null;
    current_next_action: string | null;
  };
  context: {
    latest_note_summary: string | null;
    unresolved_objections: string[];
    unfulfilled_promises: string[];
    recent_buying_stage: string | null;
    last_contact_at: string | null;
  };
};

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function asStringArray(jsonb: unknown): string[] {
  if (!Array.isArray(jsonb)) return [];
  return jsonb.filter((v): v is string => typeof v === "string");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !TOKEN_RE.test(token)) {
    return error("Invalid token format", 400);
  }

  // 1) Lead lookup by feedback_token. Token is UNIQUE so .single() is safe.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select(
      "id, name, contact, language_preference, lead_type, status, next_action",
    )
    .eq("feedback_token", token)
    .maybeSingle();

  if (leadErr) {
    return error(leadErr.message, 500);
  }
  if (!lead) {
    return notFound("Feedback link not recognised");
  }

  // 2) Latest note for this lead — prefer ai_summary, fall back to trimmed text.
  const { data: noteRow } = await supabaseAdmin
    .from("notes")
    .select("ai_summary, text, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest_note_summary =
    noteRow?.ai_summary ??
    (noteRow?.text ? noteRow.text.slice(0, 240) : null);

  // 3) Conversation chain — momentum signal + open threads.
  //    A lead may have 0 or 1 active chain; we take the most recent.
  const { data: chainRow } = await supabaseAdmin
    .from("conversation_chains")
    .select(
      "unresolved_objections, unfulfilled_promises, buying_stage_progression, last_contact_at",
    )
    .eq("lead_id", lead.id)
    .order("last_contact_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const unresolved_objections = asStringArray(chainRow?.unresolved_objections);
  const unfulfilled_promises = asStringArray(chainRow?.unfulfilled_promises);
  const recent_buying_stage =
    chainRow?.buying_stage_progression &&
    Array.isArray(chainRow.buying_stage_progression) &&
    chainRow.buying_stage_progression.length > 0
      ? chainRow.buying_stage_progression[
          chainRow.buying_stage_progression.length - 1
        ]
      : null;

  const payload: FeedbackContextResponse = {
    lead: {
      name: lead.name,
      first_name: firstName(lead.name),
      contact: lead.contact,
      language_preference: (lead.language_preference as "en" | "ta") ?? "en",
      lead_type: lead.lead_type ?? null,
      status: lead.status ?? null,
      current_next_action: lead.next_action ?? null,
    },
    context: {
      latest_note_summary,
      unresolved_objections,
      unfulfilled_promises,
      recent_buying_stage,
      last_contact_at: chainRow?.last_contact_at ?? null,
    },
  };

  return success(payload);
}
