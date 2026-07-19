/**
 * AI Analysis Service
 *
 * Analyzes call transcripts to extract insights, signals, and recommendations.
 * Also extracts lead details for auto-populating lead records.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";
import { log, logError } from "./logger";
import type {
  AnalysisResult,
  CallInsights,
  ExtractedLeadDetails,
  ProductInterest,
} from "./types";

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Analyze call transcript for sales insights
 */
export async function analyzeTranscript(
  transcript: string,
  phoneNumber: string,
  leadName?: string,
): Promise<AnalysisResult> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });

  const prompt = `You are a sales intelligence analyst for Maiyuri Bricks, a company that manufactures eco-friendly compressed earth blocks (CSEB/interlocking bricks).

Analyze this sales call transcript and provide insights in the following JSON format:

\`\`\`json
{
  "summary": "2-3 sentence summary of the call",
  "sentiment": "positive|negative|neutral|mixed",
  "complaints": ["list of customer complaints or concerns"],
  "negative_feedback": ["negative comments about products/service"],
  "negotiation_signals": ["price negotiation hints, competitor mentions"],
  "price_expectations": ["budget mentions, price expectations"],
  "positive_signals": ["buying intent signals, interest indicators"],
  "recommended_actions": ["specific next steps for the sales team"],
  "score_impact": 0.15
}
\`\`\`

Guidelines:
- score_impact should be between -0.3 and +0.3 indicating how this call affects conversion probability
- Positive signals, clear requirements, budget discussion -> positive impact
- Complaints, strong price objections, competitor preference -> negative impact
- If transcript is in Tamil, provide insights in English
- Focus on actionable intelligence for the sales team
- Keep lists concise (max 3-4 items each)

Customer: ${leadName ?? "Unknown"} (${phoneNumber})

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    const analysis = parseAnalysisResponse(response);

    log("Analysis complete", {
      sentiment: analysis.insights.sentiment,
      scoreImpact: analysis.scoreImpact,
    });

    return analysis;
  } catch (error) {
    logError("Analysis failed", error);

    return {
      summary: "Analysis unavailable - error processing transcript",
      insights: {
        sentiment: "neutral",
        recommended_actions: ["Review call recording manually"],
      },
      scoreImpact: 0,
    };
  }
}

function parseAnalysisResponse(response: string): AnalysisResult {
  try {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary || "Summary unavailable",
      insights: {
        complaints: ensureStringArray(parsed.complaints),
        negative_feedback: ensureStringArray(parsed.negative_feedback),
        negotiation_signals: ensureStringArray(parsed.negotiation_signals),
        price_expectations: ensureStringArray(parsed.price_expectations),
        positive_signals: ensureStringArray(parsed.positive_signals),
        recommended_actions: ensureStringArray(parsed.recommended_actions),
        sentiment: validateSentiment(parsed.sentiment),
      },
      scoreImpact: clampNumber(parsed.score_impact, -0.3, 0.3),
    };
  } catch (error) {
    logError("Failed to parse analysis response", error);

    return {
      summary: response.slice(0, 500),
      insights: {
        sentiment: "neutral",
      },
      scoreImpact: 0,
    };
  }
}

/**
 * Extract lead details from transcript for auto-populating lead record
 */
export async function extractLeadDetails(
  transcript: string,
  phoneNumber: string,
  leadName?: string,
): Promise<ExtractedLeadDetails> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });

  const prompt = `You are analyzing a sales call transcript for Maiyuri Bricks (CSEB/interlocking brick manufacturer in Tamil Nadu, India).

Extract lead information from this call in JSON format:

\`\`\`json
{
  "lead_type": "Residential|Commercial|Industrial|Government|Other",
  "classification": "builder|dealer|architect|direct_customer|contractor|engineer",
  "requirement_type": "residential_house|commercial_building|compound_wall|industrial_shed|government_project|other",
  "product_interests": ["8_inch_mud_interlock", "6_inch_mud_interlock", "8_inch_cement_interlock", "6_inch_cement_interlock", "compound_wall_project", "residential_project", "laying_services"],
  "site_region": "Chennai|Coimbatore|Madurai|Salem|Trichy|Tirupur|Erode|Vellore|Thanjavur|Other",
  "site_location": "specific location/area if mentioned",
  "next_action": "recommended next step",
  "follow_up_date": "YYYY-MM-DD or null",
  "estimated_quantity": null or number of bricks if mentioned,
  "notes": "any important context about the customer's requirements"
}
\`\`\`

Guidelines:
- lead_type: What type of project? (House=Residential, Shop/Office=Commercial, Factory=Industrial, Govt tender=Government)
- classification: Who is the customer? (Builder builds for others, direct_customer for themselves, dealer for reselling)
- requirement_type: Main purpose of bricks needed
- product_interests: Array of products the customer is interested in. Select from:
  - "8_inch_mud_interlock": 8" Mud Interlock Bricks (CSEB/compressed earth blocks)
  - "6_inch_mud_interlock": 6" Mud Interlock Bricks
  - "8_inch_cement_interlock": 8" Cement Interlock Bricks
  - "6_inch_cement_interlock": 6" Cement Interlock Bricks
  - "compound_wall_project": Full compound wall construction project
  - "residential_project": Full residential building project
  - "laying_services": Brick laying/construction services
  If customer mentions specific brick sizes or project types, include all matching products.
  Return empty array [] if no specific product interest is mentioned.
- site_region: Tamil Nadu district/city if mentioned
- site_location: Specific area, street, or village name if mentioned
- next_action: What should sales team do next? (e.g., "Schedule site visit", "Send quotation", "Call back next week")
- follow_up_date: WHEN should the next_action happen, as YYYY-MM-DD. Today (IST) is ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}. Resolve relative timing from the call ("call me Monday", "after two weeks", "next month"). If the call clearly needs a follow-up but no timing was mentioned, use tomorrow's date. Use null ONLY when no follow-up is needed at all.
- estimated_quantity: Number of bricks if customer mentioned (e.g., "10000 bricks" -> 10000)
- notes: Key requirements, timeline, special requests

If information is not in the transcript, use null for optional fields.
If unsure between options, make your best guess based on context.
If the transcript is in Tamil, still provide the response in English.

Customer: ${leadName ?? "Unknown"} (${phoneNumber})

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    const details = parseLeadDetailsResponse(response);

    log("Lead details extracted", {
      lead_type: details.lead_type,
      classification: details.classification,
      site_region: details.site_region,
    });

    return details;
  } catch (error) {
    logError("Failed to extract lead details", error);

    return {
      lead_type: "Other",
      classification: "direct_customer",
      requirement_type: null,
      product_interests: [],
      site_region: null,
      site_location: null,
      next_action: "Follow up with customer",
      follow_up_date: null,
      estimated_quantity: null,
      notes: null,
    };
  }
}

function parseLeadDetailsResponse(response: string): ExtractedLeadDetails {
  try {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const validLeadTypes = [
      "Residential",
      "Commercial",
      "Industrial",
      "Government",
      "Other",
    ];
    const validClassifications = [
      "builder",
      "dealer",
      "architect",
      "direct_customer",
      "contractor",
      "engineer",
    ];
    const validRequirementTypes = [
      "residential_house",
      "commercial_building",
      "compound_wall",
      "industrial_shed",
      "government_project",
      "other",
    ];
    const validProductInterests: ProductInterest[] = [
      "8_inch_mud_interlock",
      "6_inch_mud_interlock",
      "8_inch_cement_interlock",
      "6_inch_cement_interlock",
      "compound_wall_project",
      "residential_project",
      "laying_services",
    ];

    let productInterests: ProductInterest[] = [];
    if (Array.isArray(parsed.product_interests)) {
      productInterests = parsed.product_interests.filter(
        (p: unknown): p is ProductInterest =>
          typeof p === "string" &&
          validProductInterests.includes(p as ProductInterest),
      );
    }

    return {
      lead_type: validLeadTypes.includes(parsed.lead_type)
        ? parsed.lead_type
        : "Other",
      classification: validClassifications.includes(parsed.classification)
        ? parsed.classification
        : "direct_customer",
      requirement_type: validRequirementTypes.includes(parsed.requirement_type)
        ? parsed.requirement_type
        : null,
      product_interests: productInterests,
      site_region:
        typeof parsed.site_region === "string" ? parsed.site_region : null,
      site_location:
        typeof parsed.site_location === "string" ? parsed.site_location : null,
      next_action:
        typeof parsed.next_action === "string" ? parsed.next_action : null,
      follow_up_date: sanitizeFollowUpDate(parsed.follow_up_date),
      estimated_quantity:
        typeof parsed.estimated_quantity === "number"
          ? parsed.estimated_quantity
          : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } catch (error) {
    logError("Failed to parse lead details response", error);

    return {
      lead_type: "Other",
      classification: "direct_customer",
      requirement_type: null,
      product_interests: [],
      site_region: null,
      site_location: null,
      next_action: null,
      follow_up_date: null,
      estimated_quantity: null,
      notes: null,
    };
  }
}

/** Today (IST) as YYYY-MM-DD. */
function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Fool-proof the AI's follow-up date: must be a real YYYY-MM-DD; anything in
 * the past clamps to tomorrow (the model sometimes echoes a date the customer
 * SAID, e.g. "I called you last Monday"); anything more than a year out is
 * discarded as a hallucination.
 */
function sanitizeFollowUpDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const today = istToday();
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  if (value < today) return tomorrowISO;
  const yearOut = new Date(`${today}T12:00:00Z`);
  yearOut.setUTCFullYear(yearOut.getUTCFullYear() + 1);
  if (value > yearOut.toISOString().slice(0, 10)) return null;
  return value;
}

function ensureStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return undefined;
  return value.filter((v) => typeof v === "string").slice(0, 5);
}

function validateSentiment(
  value: unknown,
): CallInsights["sentiment"] {
  const valid = ["positive", "negative", "neutral", "mixed"];
  return valid.includes(String(value))
    ? (String(value) as CallInsights["sentiment"])
    : "neutral";
}

function clampNumber(value: unknown, min: number, max: number): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(min, Math.min(max, num));
}
