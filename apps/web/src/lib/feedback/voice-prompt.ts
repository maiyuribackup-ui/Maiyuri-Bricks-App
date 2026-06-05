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
 * Prebuilt Live voice. "Ursa" is the selected voice for the Tamil construction-
 * advisor persona. Gemini's prebuilt voices are NOT region-accented; they adapt
 * pronunciation to whatever language the session speaks, so Ursa renders natural
 * Tamil. Empirically verified to connect to VOICE_MODEL and stream audio (an
 * invalid name silently 1008-closes the Live socket, so every voice change is
 * connect-tested before shipping). Other female options if we want to retune,
 * sweetest→firmest: "Achernar" (soft), "Vindemiatrix" (gentle),
 * "Sulafat" (warm), "Aoede" (breezy/warm), "Leda" (youthful), "Kore" (firm).
 */
export const VOICE_NAME = "Ursa";

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
        enum: [
          "individual_home",
          "farmhouse",
          "compound_wall",
          "commercial",
          "architect_builder",
          "exploring",
          "other",
        ],
        description:
          "What they are planning to build. MUST be one of the exact enum tokens.",
      },
      rating: {
        type: Type.INTEGER,
        description: "Overall factory-visit rating from 1 (poor) to 5 (excellent).",
      },
      impressed: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          enum: [
            "brick_quality",
            "strength",
            "natural_soil",
            "wall_finish",
            "cooler_home",
            "factory_process",
            "team_knowledge",
            "completed_homes",
            "eco",
            "cost_saving",
          ],
        },
        description:
          "What impressed them most at the visit (up to 3). Each MUST be one of the " +
          "exact enum tokens.",
      },
      clarity: {
        type: Type.STRING,
        enum: ["very_clear", "mostly_clear", "need_comparison", "not_clear"],
        description:
          "How clear they are about choosing Maiyuri bricks. One of the exact enum tokens.",
      },
      benefits: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          enum: [
            "cooler",
            "strong",
            "lower_cost",
            "faster",
            "natural",
            "less_plaster",
            "eco",
            "finish",
          ],
        },
        description:
          "Benefits that matter most for their home (up to 3). Each MUST be one of the " +
          "exact enum tokens.",
      },
      concerns: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          enum: [
            "cost",
            "load_bearing",
            "rain",
            "availability",
            "masons",
            "finishing",
            "acceptance",
            "none",
          ],
        },
        description:
          "Concerns they'd still like addressed. Each MUST be one of the exact enum tokens.",
      },
      timeline: {
        type: Type.STRING,
        enum: ["within_30d", "1_3m", "3_6m", "6m_plus", "planning", "architect_future"],
        description:
          "When they plan to build/purchase. MUST be one of the exact enum tokens.",
      },
      next_action: {
        type: Type.STRING,
        enum: [
          "quote",
          "floor_plan",
          "advisor",
          "architect",
          "visit_project",
          "reports",
          "sample",
          "later",
          "exploring",
        ],
        description: "What they want next. MUST be one of the exact enum tokens.",
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
    "- Short, gentle spoken sentences. One question at a time.",
    "- PACE: speak at a brisk, lively, upbeat pace — warm but quick, like a friendly advisor who",
    "  values the visitor's time. Keep every reply tight (usually one sentence), skip preamble and",
    "  filler, and move smartly to the next question with almost no pause. The whole form should",
    "  feel fast and easy to finish — never slow, drawn-out, or sleepy.",
    "- ALWAYS offer the answer choices aloud when you ask a question, so they never have to",
    "  guess what to say — but speak them as a warm, natural spoken menu ('would you like A,",
    "  B, or C?'), NEVER as a robotic numbered list. Give 2–4 simple options, then pause and",
    "  let them pick (they may always answer in their own words).",
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
    "## The feedback form — you MUST cover EVERY question below, in this order",
    "This is a feedback FORM with set questions. Your job is to gently fill ALL of it — do NOT",
    "skip any question. Ask them one at a time, conversationally, and for each one READ THE",
    "OPTIONS ALOUD as a warm spoken menu so they just pick. They may answer in their own words,",
    "and may pass on any non-required question ('no problem, we'll skip that') — but you must still",
    "ASK every question. Keep each exchange short so the whole form stays light and friendly.",
    "",
    "Q1. Their name. (required) → name",
    "Q2. A 10-digit WhatsApp number so the team can follow up. (required) → mobile",
    "Q3. 'What are you planning to build?' Offer: an individual home or villa, a farmhouse, a",
    "    compound wall, a commercial building, are you an architect or builder, or just exploring?",
    "    → build_type",
    "Q4. 'How would you rate your factory visit, from 1 to 5?' (1 = not great, 5 = excellent visit)",
    "    (required) → rating",
    "Q5. 'What impressed you most?' (let them pick up to 3) Offer: the brick quality, strength and",
    "    durability, the natural red-soil material, the wall finish, cooler comfortable homes, the",
    "    factory and process, the team's knowledge, completed project photos, the eco-friendly",
    "    approach, or overall cost savings? → impressed",
    "Q6. 'Which benefits matter most for your home?' (up to 3) Offer: cooler interiors, strength",
    "    and durability, lower overall cost, faster construction, natural and chemical-free, less",
    "    plastering, eco-friendly, or the beautiful natural finish? → benefits",
    "Q7. 'Any concerns you'd still like us to address?' Offer: cost or budget, strength for",
    "    load-bearing, performance in heavy rain, availability or delivery, finding skilled masons,",
    "    wall-finishing options, family or resale acceptance — or none, you're convinced? Gently",
    "    address known open objections above if relevant; be honest and proof-based. → concerns",
    "Q8. 'When are you planning to build or purchase?' Offer: within a month, one to three months,",
    "    three to six months, six months or later, still planning, or your architect decides later?",
    "    → timeline",
    "Q9. 'What would you like Maiyuri to help you with next?' (required) Offer: a personalised quote,",
    "    share your floor plan for review, speak with an advisor, arrange a chat with your architect",
    "    or builder, visit a completed project, receive test reports and details, get a free sample,",
    "    follow up later, or just exploring? → next_action",
    "Q10. 'Anything else you'd like us to know?' (optional) → next_action_notes",
    "",
    "If they sound unhappy, urgent, or ask for a quick call back, set priority_followup = true with a",
    "one-line followup_reason.",
    "",
    "## Rules",
    "- Be a guide, never pushy. NEVER say 'are you ready to buy', never hard-sell, never claim",
    "  'best in the world'. Confidence comes from calmly stated proof, not hype.",
    "- Cover ALL ten questions — do not end early or jump straight to the next step. Move briskly",
    "  and warmly through them; the whole form should feel light, not like an interrogation.",
    "- Confirm the mobile number by softly reading it back once.",
    "- If they hesitate or want to stop entirely, reassure them warmly ('no problem at all,",
    "  sir/madam') and wrap up graciously with whatever you have.",
    "- ONLY after you have asked all the questions above, call the `submit_feedback` tool ONCE with",
    "  everything you gathered (use the exact option tokens; omit any a visitor genuinely skipped),",
    "  then thank them warmly by name and end. Do not keep talking after submitting.",
    "- EARLY FINISH: if the visitor says they want to stop, finish, or are in a hurry — or you are",
    "  told to wrap up — do NOT keep asking the remaining questions. Immediately call `submit_feedback`",
    "  ONCE with whatever you have gathered so far (omit fields you genuinely didn't get), then thank",
    "  them warmly and end. A partial submission is far better than none.",
    "- Never invent a mobile number, rating, or request. If you didn't get the mobile number or a",
    "  rating, gently ask for it before submitting.",
  ].join("\n");
}
