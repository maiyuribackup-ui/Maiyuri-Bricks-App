export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { success, error, notFound } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRateCard } from "@/lib/pricing";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";

/**
 * GET /api/leads/[id]/brief — the AI pre-call brief (Golden Hour GH2).
 * One screen the rep reads before dialling: who this is, what they want,
 * what to quote (from the rate card), the likely objection with its answer,
 * and an opening line in Tamil. Makes a 30-minute callback sound like a
 * week of preparation.
 */
const briefSchema = z.object({
  who: z.string().default(""),
  situation: z.string().default(""),
  distance_note: z.string().default(""),
  price_guidance: z.array(z.string()).default([]),
  likely_objection: z.string().default(""),
  objection_answer: z.string().default(""),
  opening_line_ta: z.string().default(""),
  opening_line_en: z.string().default(""),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const [{ data: lead }, { data: lastCall }, rateCard, { data: factory }] =
      await Promise.all([
        supabaseAdmin.from("leads").select("*").eq("id", id).single(),
        supabaseAdmin
          .from("call_recordings")
          .select("ai_summary, transcription_text, created_at")
          .eq("lead_id", id)
          .eq("processing_status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        getRateCard(),
        supabaseAdmin
          .from("factory_settings")
          .select("address")
          .limit(1)
          .maybeSingle(),
      ]);

    if (!lead) return notFound("Lead not found");

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return error("AI not configured", 503);

    const rateLines = rateCard.products
      .map((p) => {
        const bands = rateCard.entries.filter((e) => e.product_id === p.id);
        if (!bands.length) return `- ${p.name}: ₹${p.base_price}/${p.unit} (base)`;
        return `- ${p.name}: ${bands
          .map((b) => `${b.km_from}-${b.km_to}km ₹${b.unit_price}`)
          .join(", ")} per ${p.unit} (delivered)`;
      })
      .join("\n");

    const prompt = `You are the sales coach for Maiyuri Bricks (CSEB/interlocking bricks, factory at ${factory?.address ?? "Red Hills, Chennai"}). A rep is about to CALL this lead in the next few minutes. Write their pre-call brief.

LEAD
Name: ${lead.name} · Phone: ${lead.contact}
Type: ${lead.lead_type ?? "?"} · Classification: ${lead.classification ?? "?"} · Requirement: ${lead.requirement_type ?? "?"}
Site: ${[lead.site_location, lead.site_region].filter(Boolean).join(", ") || "unknown"}
Stage: ${lead.pipeline_stage} · Temperature: ${lead.lead_temperature ?? "?"} · Source: ${lead.source ?? "?"}
Estimated quantity: ${lead.estimated_quantity ?? "unknown"} · Next action on file: ${lead.next_action ?? "none"}

LAST CALL SUMMARY (may be empty):
${lastCall?.ai_summary ?? "No call recorded yet."}

DELIVERED RATE CARD (price depends on distance from the factory):
${rateLines}

TASK — respond with ONLY a JSON code block:
\`\`\`json
{
  "who": "1 line: who this person is and what they're building",
  "situation": "2-3 lines: where things stand, what they said, what they need to hear next",
  "distance_note": "Estimate the road distance from the factory (${factory?.address ?? "Red Hills, Chennai"}) to their site using your knowledge of Tamil Nadu geography. Format: 'Site ~35km away (estimate — confirm on call)'. If site unknown: 'Ask for the site location to fix the price band.'",
  "price_guidance": ["1-3 lines: the exact prices to quote for THEIR likely products at THEIR estimated distance band, from the rate card above. Quote delivered prices. If quantity known, include the order total."],
  "likely_objection": "the single most likely objection from THIS lead (price/trust/technical)",
  "objection_answer": "the 2-line answer, using the wall-cost logic (no plastering, less cement, faster build) where relevant",
  "opening_line_ta": "a warm, natural opening line in Tamil for this specific person",
  "opening_line_en": "the same opening line in English"
}
\`\`\``;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_DEFAULT_MODEL,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch =
      text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return error("Brief generation failed", 502);

    const parsed = briefSchema.safeParse(JSON.parse(jsonMatch[1] ?? jsonMatch[0]));
    if (!parsed.success) return error("Brief generation failed", 502);

    return success({
      ...parsed.data,
      lead_id: id,
      lead_name: lead.name,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Brief] failed:", err);
    return error("Failed to generate the pre-call brief", 500);
  }
}
