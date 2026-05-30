/**
 * POST /api/feedback/[token]/voice-token
 *
 * Public, token-gated endpoint that mints a short-lived Gemini Live ephemeral
 * token for the voice-feedback conversation. The browser never sees the real
 * Google API key — it receives only this single-use ephemeral token, scoped
 * (via `liveConnectConstraints`) to one locked model, system prompt, voice,
 * and tool. The token expires in minutes and is good for one session.
 *
 * Flow:
 *   1. Resolve `feedback_token` -> lead (same lookup as the Phase-2 GET route).
 *   2. Fetch the personalisation context (latest note + conversation chain).
 *   3. Build the locked Live config (Tamil-first system prompt + submit_feedback
 *      tool + warm male voice).
 *   4. Call Gemini's authTokens.create with that config + a 10-minute expiry.
 *   5. Return { token, model, expires_at, language } to the client.
 *
 * Auth: the opaque feedback token in the URL is the auth (token-gated), exactly
 * like the sibling /api/feedback/* routes (allowlisted in middleware.ts).
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 4)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound } from "@/lib/api-utils";
import {
  buildVoiceSystemPrompt,
  SUBMIT_FEEDBACK_TOOL,
  VOICE_MODEL,
  VOICE_NAME,
  type VoiceLanguage,
  type VoiceLeadContext,
} from "@/lib/feedback/voice-prompt";

// Token alphabet matches gen_feedback_token() in the migration.
const TOKEN_RE = /^[A-HJ-NP-Z2-9]{10}$/;

// Session lifetime knobs. New sessions must START within NEW_SESSION_WINDOW;
// once connected, the session may run until TOKEN_EXPIRY.
const NEW_SESSION_WINDOW_MS = 2 * 60 * 1000; // 2 min to begin the call
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 min hard session cap

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function asStringArray(jsonb: unknown): string[] {
  if (!Array.isArray(jsonb)) return [];
  return jsonb.filter((v): v is string => typeof v === "string");
}

/** Resolve the Google API key across the names seen in this codebase. */
function getGoogleApiKey(): string | null {
  return (
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    // Observed casing on the Vercel project (env var names are case-sensitive).
    process.env.Gemini_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    null
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !TOKEN_RE.test(token)) {
    return error("Invalid token format", 400);
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    return error("Voice service not configured", 500);
  }

  // 1) Lead lookup by feedback_token.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select(
      "id, name, language_preference, lead_type, status, next_action, ai_summary",
    )
    .eq("feedback_token", token)
    .maybeSingle();

  if (leadErr) return error(leadErr.message, 500);
  if (!lead) return notFound("Feedback link not recognised");

  // 2) Latest note summary.
  const { data: noteRow } = await supabaseAdmin
    .from("notes")
    .select("ai_summary, text, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest_note_summary =
    noteRow?.ai_summary ?? (noteRow?.text ? noteRow.text.slice(0, 240) : null);

  // 2b) Most recent PROCESSED phone-call recording — its AI summary is the
  //     literal "previous call" the host should sound informed about.
  const { data: callRow } = await supabaseAdmin
    .from("call_recordings")
    .select("ai_summary, processing_status, created_at")
    .eq("lead_id", lead.id)
    .eq("processing_status", "completed")
    .not("ai_summary", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previous_call_summary = callRow?.ai_summary
    ? String(callRow.ai_summary).slice(0, 600)
    : null;

  const lead_ai_summary = lead.ai_summary
    ? String(lead.ai_summary).slice(0, 600)
    : null;

  // 3) Conversation chain — open threads.
  const { data: chainRow } = await supabaseAdmin
    .from("conversation_chains")
    .select(
      "unresolved_objections, unfulfilled_promises, buying_stage_progression",
    )
    .eq("lead_id", lead.id)
    .order("last_contact_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recent_buying_stage =
    chainRow?.buying_stage_progression &&
    Array.isArray(chainRow.buying_stage_progression) &&
    chainRow.buying_stage_progression.length > 0
      ? chainRow.buying_stage_progression[
          chainRow.buying_stage_progression.length - 1
        ]
      : null;

  // Tamil is the default voice language for the factory-visit audience; only an
  // explicit "en" preference opens the call in English.
  const language: VoiceLanguage =
    lead.language_preference === "en" ? "en" : "ta";

  const ctx: VoiceLeadContext = {
    first_name: firstName(lead.name),
    full_name: lead.name,
    language_preference: language,
    lead_type: lead.lead_type ?? null,
    status: lead.status ?? null,
    current_next_action: lead.next_action ?? null,
    latest_note_summary,
    lead_ai_summary,
    previous_call_summary,
    unresolved_objections: asStringArray(chainRow?.unresolved_objections),
    unfulfilled_promises: asStringArray(chainRow?.unfulfilled_promises),
    recent_buying_stage,
  };

  // 4) Mint the ephemeral token with a locked Live config.
  //    Ephemeral tokens require the v1alpha API surface.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });

  const now = Date.now();
  const expireTime = new Date(now + TOKEN_EXPIRY_MS).toISOString();
  const newSessionExpireTime = new Date(
    now + NEW_SESSION_WINDOW_MS,
  ).toISOString();

  try {
    const auth = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: VOICE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: buildVoiceSystemPrompt(ctx),
            tools: [{ functionDeclarations: [SUBMIT_FEEDBACK_TOOL] }],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICE_NAME },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
        // NOTE: do NOT set lockAdditionalFields — passing it (even []) makes the
        // SDK send a field_mask the Live setup rejects ("field_mask is invalid
        // for BidiGenerateContentSetup"). Omitting it locks the config fields
        // we set above, which is exactly the scoping we want.
      },
    });

    if (!auth?.name) {
      return error("Failed to mint voice token", 502);
    }

    return success({
      token: auth.name,
      model: VOICE_MODEL,
      expires_at: expireTime,
      language,
    });
  } catch (e) {
    console.error("[voice-token] mint failed:", e);
    return error("Voice token service unavailable", 502);
  }
}
