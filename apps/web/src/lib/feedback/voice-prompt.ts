/**
 * Voice-feedback prompt + tool builder (Phase 4).
 *
 * Produces the locked Gemini Live session configuration for a single factory-
 * visit voice conversation: the Tamil-first (EN / தமிழ்) system instruction, the
 * single callable tool (`submit_feedback`), and the professional female TTS voice.
 *
 * The system prompt is personalised from the same lead context the Phase-2 GET
 * endpoint returns, so "Maiyuri" greets the visitor by name and can gently
 * probe the known open threads (objections, promises) without re-asking what
 * the team already knows.
 *
 * NOTE: this builder is deliberately data-only — it returns plain objects so
 * the route can drop them straight into `authTokens.create`'s
 * `liveConnectConstraints.config`. No SDK client is constructed here.
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 4)
 */

import { Type, type FunctionDeclaration } from "@google/genai";

export type VoiceLanguage = "en" | "ta";

/**
 * Prebuilt Live voice. "Kore" is a composed, firm FEMALE voice — the most
 * professional of the female timbres, which suits a polished Tamil-speaking
 * relationship manager. Gemini's prebuilt voices are NOT region-accented; they
 * adapt pronunciation to whatever language the session speaks, so Kore renders
 * natural Tamil. Other female options if we want to retune: "Aoede" (warmer/
 * breezier), "Leda" (younger), "Zephyr" (brighter).
 */
export const VOICE_NAME = "Kore";

/**
 * Live model id. Must be one the API actually serves for `bidiGenerateContent`
 * (a wrong id 404s on the Live socket with close code 1008, even though the
 * ephemeral-token mint still succeeds). Verified via ListModels + a full
 * ephemeral mint→connect→audio round-trip with our locked config (Aoede voice +
 * submit_feedback tool). The 3.1 Flash Live preview is the latest and handles
 * EN/தமிழ் code-switching + tool-calling well.
 *
 * Other valid ids if we ever need to fall back:
 *   gemini-2.5-flash-native-audio-latest
 *   gemini-2.5-flash-native-audio-preview-12-2025
 */
export const VOICE_MODEL = "gemini-3.1-flash-live-preview";

/** Minimal lead context needed to personalise the conversation. */
export interface VoiceLeadContext {
  first_name: string;
  full_name: string;
  language_preference: VoiceLanguage;
  lead_type: string | null;
  status: string | null;
  current_next_action: string | null;
  latest_note_summary: string | null;
  /** Lead-level AI rollup summary (leads.ai_summary). */
  lead_ai_summary: string | null;
  /** AI summary of the most recent processed phone call (call_recordings.ai_summary). */
  previous_call_summary: string | null;
  unresolved_objections: string[];
  unfulfilled_promises: string[];
  recent_buying_stage: string | null;
}

/**
 * The ONLY tool the voice agent may call. Its shape mirrors the
 * `/api/feedback/[token]/submit` payload (flattened for easy model filling);
 * the browser client maps these args onto the nested submit body and injects
 * `channel: "voice"` + the live transcript before POSTing.
 */
export const SUBMIT_FEEDBACK_TOOL: FunctionDeclaration = {
  name: "submit_feedback",
  description:
    "Record the visitor's factory-visit feedback. Call this EXACTLY ONCE, " +
    "only after you have confirmed the visitor's name, mobile number, their " +
    "star rating, and what they want to happen next. Do not call it earlier.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: "Visitor's name as they said it.",
      },
      mobile: {
        type: Type.STRING,
        description: "Visitor's 10-digit Indian mobile number, digits only.",
      },
      build_type: {
        type: Type.STRING,
        description:
          "What they are building, e.g. 'home', 'commercial', 'compound wall'. Optional.",
      },
      rating: {
        type: Type.INTEGER,
        description: "Overall factory-visit rating from 1 (poor) to 5 (excellent).",
      },
      impressed: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Short phrases for what impressed them (e.g. 'machinery', 'quality', 'team').",
      },
      clarity: {
        type: Type.STRING,
        description:
          "How clear they are about choosing Maiyuri bricks. One of: " +
          "very_clear, mostly_clear, need_comparison, not_clear.",
      },
      benefits: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Product benefits that matter most to them.",
      },
      concerns: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Any concerns, hesitations, or objections they raised (e.g. 'price', 'availability').",
      },
      timeline: {
        type: Type.STRING,
        description:
          "When they plan to buy/start, e.g. 'this month', '2-3 months', 'just exploring'. Optional.",
      },
      next_action: {
        type: Type.STRING,
        description:
          "What they want next. One of: quote, floor_plan, advisor, architect, " +
          "visit_project, reports, sample, later, exploring.",
      },
      next_action_notes: {
        type: Type.STRING,
        description: "Any extra detail about their request, in their own words. Optional.",
      },
      priority_followup: {
        type: Type.BOOLEAN,
        description:
          "True only if they sounded unhappy, urgent, or explicitly asked for a quick call back.",
      },
      followup_reason: {
        type: Type.STRING,
        description: "One short line on why a priority follow-up is needed. Optional.",
      },
    },
    required: ["name", "mobile", "rating", "next_action"],
  },
};

function contextBlock(ctx: VoiceLeadContext): string {
  const lines: string[] = [];
  lines.push(`Visitor name: ${ctx.full_name} (call them ${ctx.first_name}).`);
  if (ctx.lead_type) lines.push(`Lead type: ${ctx.lead_type}.`);
  if (ctx.status) lines.push(`Current status: ${ctx.status}.`);
  if (ctx.recent_buying_stage) lines.push(`Buying stage: ${ctx.recent_buying_stage}.`);
  if (ctx.current_next_action)
    lines.push(`Team's planned next step: ${ctx.current_next_action}.`);
  if (ctx.previous_call_summary)
    lines.push(`Summary of our previous phone call with them: ${ctx.previous_call_summary}`);
  if (ctx.lead_ai_summary)
    lines.push(`Overall AI summary of this lead so far: ${ctx.lead_ai_summary}`);
  if (ctx.latest_note_summary)
    lines.push(`Last interaction note: ${ctx.latest_note_summary}`);
  if (ctx.unresolved_objections.length)
    lines.push(`Known open objections: ${ctx.unresolved_objections.join("; ")}.`);
  if (ctx.unfulfilled_promises.length)
    lines.push(`Promises we still owe them: ${ctx.unfulfilled_promises.join("; ")}.`);
  return lines.join("\n");
}

/**
 * Build the locked system instruction. The agent's persona is "Maiyuri", a
 * warm, concise factory host. It speaks the visitor's preferred language by
 * default but mirrors whatever language the visitor actually uses.
 */
export function buildVoiceSystemPrompt(ctx: VoiceLeadContext): string {
  const langLine =
    ctx.language_preference === "en"
      ? "Open in English. If the visitor replies in Tamil or Tanglish, switch to match them immediately."
      : "Greet and speak in polished, courteous spoken Tamil (தமிழ்) by default — this is the default language. Always use the respectful form (நீங்கள்/உங்கள்). Keep it professional but warm and natural; everyday Tanglish loanwords like 'quote', 'sample', 'WhatsApp' are fine, but avoid stiff literary Tamil. Only switch fully to English if the visitor clearly speaks to you in English.";

  return [
    "You are Maiyuri, the warm, friendly voice host for Maiyuri Bricks, an AAC",
    "(autoclaved aerated concrete) block manufacturer in Tamil Nadu. A customer",
    "has just finished visiting the factory and you are collecting their feedback",
    "over a short voice call on their phone.",
    "",
    "## Your personality",
    "- Professional, courteous, and composed — like a well-trained relationship manager, not a survey bot. Warm, but not casual or chatty.",
    "- Speak in short, clear, polished spoken sentences. One question at a time.",
    "- Never read out lists of options robotically. Ask conversationally but respectfully.",
    "- " + langLine,
    "- Use the visitor's first name naturally, but don't overuse it.",
    "",
    "## What you already know (do NOT re-ask these; use them to sound informed)",
    contextBlock(ctx),
    "",
    "## Your goal — gather, in a natural order:",
    "1. Confirm who you're speaking to (their name) and a 10-digit mobile number to follow up on.",
    "2. Their overall rating of the factory visit (1 to 5 stars).",
    "3. What impressed them, and any concerns or hesitations (gently probe the known open objections above if relevant).",
    "4. What they want to happen next (a quote, a sample, an advisor call, a project visit, or just to keep exploring).",
    "",
    "## Rules",
    "- Keep the whole call under ~2 minutes. Be efficient and warm, never pushy.",
    "- Confirm the mobile number by reading it back once.",
    "- If they go quiet or want to stop, thank them warmly and wrap up.",
    "- When you have their name, mobile, rating, and desired next step, call the",
    "  `submit_feedback` tool ONCE with everything you gathered, then thank them",
    "  warmly by name and end the conversation. Do not keep talking after submitting.",
    "- Never invent a mobile number, rating, or request. If you didn't get the",
    "  mobile number, ask for it before submitting.",
  ].join("\n");
}
