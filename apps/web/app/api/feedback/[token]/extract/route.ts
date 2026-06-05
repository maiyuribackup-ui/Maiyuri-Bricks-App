/**
 * POST /api/feedback/[token]/extract
 *
 * Transcript-extraction FALLBACK for the voice-feedback flow. When the live
 * conversation ends before the model emits its `submit_feedback` tool call
 * (visitor taps "End conversation", goes silent, or the socket drops), the
 * browser still holds the full dialogue transcript — but the review grid would
 * otherwise be empty. This endpoint runs a one-shot Gemini extraction over that
 * transcript into the SAME flat field shape the voice tool produces, so the
 * review grid can be pre-filled and the visitor just confirms.
 *
 * Reuses SUBMIT_FEEDBACK_TOOL's parameter schema (enums included) but drops the
 * `required` constraint: extraction must only fill what the visitor actually
 * said and omit everything else — never invent a mobile, rating, or request.
 *
 * Auth: the opaque feedback token in the URL is the auth (token-gated), exactly
 * like the sibling /api/feedback/* routes (allowlisted in middleware.ts).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest } from "next/server";
import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound, handleZodError } from "@/lib/api-utils";
import { SUBMIT_FEEDBACK_TOOL } from "@/lib/feedback/voice-prompt";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";

const TOKEN_RE = /^[A-HJ-NP-Z2-9]{10}$/;

const bodySchema = z.object({
  transcript: z.string().trim().min(1).max(20000),
});

/** Resolve the Google API key across the names seen in this codebase. */
function getGoogleApiKey(): string | null {
  return (
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.Gemini_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    null
  );
}

// Extraction variant of the voice tool: same properties + enums, but NOTHING is
// required — the model fills only what the transcript clearly supports.
const EXTRACT_TOOL = {
  name: SUBMIT_FEEDBACK_TOOL.name,
  description:
    "Extract the visitor's factory-visit feedback from the conversation " +
    "transcript. Fill ONLY fields the visitor clearly stated; omit anything " +
    "not mentioned. Never invent a name, mobile number, rating, or request.",
  parameters: {
    ...SUBMIT_FEEDBACK_TOOL.parameters,
    required: [] as string[],
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || !TOKEN_RE.test(token)) {
    return error("Invalid token format", 400);
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey) return error("Extraction service not configured", 500);

  // Validate the token resolves to a real lead (and grab the name as a fallback).
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, name")
    .eq("feedback_token", token)
    .maybeSingle();
  if (leadErr) return error(leadErr.message, 500);
  if (!lead) return notFound("Feedback link not recognised");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return handleZodError(parsed.error);
  const { transcript } = parsed.data;

  const ai = new GoogleGenAI({ apiKey });

  const prompt = [
    "You are extracting structured factory-visit feedback from a transcript of a",
    "spoken conversation between Maiyuri (the host) and a visitor. Read the whole",
    "dialogue and call submit_feedback with the visitor's answers.",
    "",
    "STRICT RULES:",
    "- Use ONLY what the visitor actually said. If a field was not clearly answered,",
    "  OMIT it entirely — do not guess and never invent a mobile number or rating.",
    "- Map answers to the exact enum tokens defined in the tool schema.",
    "- mobile must be the 10-digit number the visitor gave, digits only.",
    "- rating is their 1-5 visit rating only if they actually gave one.",
    "",
    "TRANSCRIPT:",
    transcript,
  ].join("\n");

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_DEFAULT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0,
        tools: [{ functionDeclarations: [EXTRACT_TOOL] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["submit_feedback"],
          },
        },
      },
    });

    const call = resp.functionCalls?.[0];
    const args = (call?.args ?? {}) as Record<string, unknown>;

    // The client maps these onto its `captured` state via the same captureFromArgs
    // it uses for the live tool call, so return the flat arg shape verbatim.
    return success({ fields: args, lead_name: lead.name });
  } catch (e) {
    console.error("[feedback/extract] failed:", e);
    return error("Could not extract from transcript", 502);
  }
}
