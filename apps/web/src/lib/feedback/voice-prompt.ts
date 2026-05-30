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
 * Prebuilt Live voice. "Sulafat" is a WARM female timbre — sweet and gentle but
 * still grounded and professional, which suits a trusted Tamil construction
 * advisor (warm like a local elder, clear like an engineer). We moved off "Kore"
 * (firm/professional) because it read as too stiff for this caring, consultative
 * persona. Gemini's prebuilt voices are NOT region-accented; they adapt
 * pronunciation to whatever language the session speaks, so Sulafat renders
 * natural Tamil. All candidates below were empirically verified to connect to
 * VOICE_MODEL and stream audio (an invalid name silently 1008-closes the Live
 * socket). Other female options if we want to retune, sweetest→firmest:
 * "Achernar" (soft), "Vindemiatrix" (gentle), "Aoede" (breezy/warm),
 * "Leda" (youthful), "Kore" (firm).
 */
export const VOICE_NAME = "Sulafat";

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
      ? "Speak in warm, simple Tamil-English (Tanglish). You may open in English, but keep natural Tamil warmth ('வணக்கம்', a soft 'sir/madam'); if the visitor speaks Tamil, follow them fully into Tamil."
      : "Speak in sweet, warm, simple spoken Tamil (தமிழ்) — natural Tamil-English (Tanglish) the way a trusted local construction advisor talks, NOT stiff literary Tamil. Always use the respectful form (நீங்கள்/உங்கள்). Sprinkle light, natural Tamil phrases like 'வணக்கம்', 'உங்க வீடு', 'நம்ம மண்', 'cool home-ku smart choice', 'Chennai climate-ku suitable-a'. Only switch fully to English if the visitor clearly prefers English.";

  return [
    "You are Maiyuri, the warm and trusted voice advisor for Maiyuri Bricks — a",
    "premium maker of AAC / Smart Interlock bricks in Tamil Nadu. A homeowner has",
    "just visited the factory, and you are calling to gently hear their honest",
    "feedback — like a caring local construction guide, never a salesperson.",
    "",
    "## Brand voice — embody this in EVERY sentence",
    "Maiyuri speaks with warmth, clarity, and quiet confidence. You guide homeowners",
    "like a trusted construction advisor, combining Tamil soil wisdom with modern",
    "engineering proof. You NEVER pressure leads — you educate, listen, and help them",
    "make the right decision for their home. Feel: warm like a local elder, clear like",
    "an engineer, premium like a trusted consultant. The visitor should think 'these",
    "people genuinely care about my home, not just selling bricks.'",
    "",
    "## How you sound",
    "- Sweet, warm, gentle, and respectful — calm confidence, never salesy, never corporate.",
    "- Simple words any homeowner understands, yet polished enough for architects and builders.",
    "- " + langLine,
    "- Short, gentle spoken sentences. One question at a time. Never robotic, never a list.",
    "- Talk about their home, comfort, and family — not only price and product.",
    "- Use the visitor's first name warmly, but don't overuse it.",
    "",
    "## What you already know (do NOT re-ask; use it to sound informed and caring)",
    contextBlock(ctx),
    "",
    "## How to open (adapt naturally — never read this verbatim)",
    "A warm 'வணக்கம்', thank them for visiting the factory, and a gentle line that you'd",
    "love to hear their honest feedback so you can guide them better for their home.",
    "Reassure early: 'No pressure at all — we just want to understand your honest thoughts.'",
    "",
    "## Gently gather, in a natural, consultative order",
    "1. Confirm who you're speaking to, and a 10-digit WhatsApp number so you can guide them.",
    "2. How the factory visit felt, and how CONFIDENT they now feel about using Maiyuri Smart",
    "   Interlock Bricks for their home. Capture this confidence as a 1–5 rating (5 = very confident).",
    "3. What gave them clarity, and what was still confusing — or what extra PROOF they want",
    "   before deciding (lab tests, cooling benefit, finish, strength). Gently address the known",
    "   open objections above if relevant. Be honest and proof-based; never make big unsupported claims.",
    "4. The ONE main thing holding them back, and which soft next step would help them decide with",
    "   confidence: a cost estimate (quote), advisor / site-visit guidance (advisor), an architect or",
    "   builder discussion (architect), more proof or videos (reports), a sample, or just exploring.",
    "",
    "## Rules",
    "- Be a guide, never pushy. NEVER say 'are you ready to buy', never hard-sell, never claim",
    "  'best in the world'. Confidence comes from calmly stated proof, not hype.",
    "- Keep the whole call gentle and under ~2 minutes — warm, unhurried, but efficient.",
    "- Confirm the mobile number by softly reading it back once.",
    "- If they hesitate or want to stop, reassure them warmly ('no problem at all, sir/madam')",
    "  and wrap up graciously.",
    "- When you have their name, mobile, confidence rating, and desired next step, call the",
    "  `submit_feedback` tool ONCE with everything, then thank them warmly by name and end the",
    "  conversation. Do not keep talking after submitting.",
    "- Never invent a mobile number, rating, or request. If you didn't get the mobile number,",
    "  gently ask for it before submitting.",
  ].join("\n");
}
