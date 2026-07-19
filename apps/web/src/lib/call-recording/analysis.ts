/**
 * AI Analysis Service
 *
 * Analyzes call transcripts to extract insights, signals, and recommendations.
 * Also extracts lead details for auto-populating lead records.
 */

import { generateTextWithFallback } from "@/lib/ai/text-fallback";
import { log, logError } from "./logger";
import type {
  AnalysisResult,
  CallInsights,
  ExtractedLeadDetails,
  ProductInterest,
} from "./types";

/**
 * Analyze call transcript for sales insights
 */
export async function analyzeTranscript(
  transcript: string,
  phoneNumber: string,
  leadName?: string,
): Promise<AnalysisResult> {

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
    const out = await generateTextWithFallback(prompt);
    if (!out) throw new Error("AI providers unavailable (Gemini + DeepSeek)");
    const response = out.text;

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
  "customer_name": "the customer's name as spoken on the call, or null",
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
- customer_name: The customer's actual name if said on the call (e.g. "நான் Nelson பேசுறேன்" -> "Nelson"). Proper name only, no titles/numbers. null if never mentioned.
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
    const out = await generateTextWithFallback(prompt);
    if (!out) throw new Error("AI providers unavailable (Gemini + DeepSeek)");
    const response = out.text;

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
      customer_name: null,
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
      customer_name: sanitizeCustomerName(parsed.customer_name),
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
      customer_name: null,
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
 * A usable name: 2-60 chars, contains at least one letter, isn't just digits
 * (the junk the filename regex used to produce) and isn't a generic word.
 */
function sanitizeCustomerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length < 2 || name.length > 60) return null;
  if (!/[A-Za-z஀-௿]/.test(name)) return null; // must contain a letter (Latin or Tamil)
  if (/^(customer|unknown|caller|sir|madam)$/i.test(name)) return null;
  return name;
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

/**
 * ONE Gemini call for both the sales analysis and the lead extraction —
 * halves latency/cost per recording and removes a failure point. Falls back
 * to the two sequential calls if the combined response doesn't parse.
 */
export async function analyzeCallCombined(
  transcript: string,
  phoneNumber: string,
  leadName?: string,
): Promise<{ analysis: AnalysisResult; details: ExtractedLeadDetails }> {
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const prompt = `You are a sales intelligence analyst for Maiyuri Bricks (CSEB/interlocking brick manufacturer in Tamil Nadu, India). Today (IST) is ${today}.

Analyze this sales call transcript and respond with ONE JSON object containing BOTH sections:

\`\`\`json
{
  "analysis": {
    "summary": "2-3 sentence summary of the call",
    "sentiment": "positive|negative|neutral|mixed",
    "complaints": [], "negative_feedback": [], "negotiation_signals": [],
    "price_expectations": [], "positive_signals": [],
    "recommended_actions": ["specific next steps"],
    "score_impact": 0.15
  },
  "lead": {
    "lead_type": "Residential|Commercial|Industrial|Government|Other",
    "classification": "builder|dealer|architect|direct_customer|contractor|engineer",
    "requirement_type": "residential_house|commercial_building|compound_wall|industrial_shed|government_project|other",
    "product_interests": ["8_inch_mud_interlock","6_inch_mud_interlock","8_inch_cement_interlock","6_inch_cement_interlock","compound_wall_project","residential_project","laying_services"],
    "site_region": "Chennai|Coimbatore|Madurai|Salem|Trichy|Tirupur|Erode|Vellore|Thanjavur|Other",
    "site_location": "specific area or null",
    "customer_name": "the customer's name as spoken, or null",
    "next_action": "what the sales team should do next",
    "follow_up_date": "YYYY-MM-DD or null",
    "estimated_quantity": null,
    "notes": "key requirements/timeline"
  }
}
\`\`\`

Guidelines:
- score_impact: -0.3..+0.3 (buying signals up, hard objections down).
- customer_name: proper name only if actually said on the call; no titles, no digits.
- follow_up_date: WHEN the next_action should happen. Resolve relative timing ("call me Monday", "after two weeks") from today's date above. If a follow-up is clearly needed but no timing was said, use tomorrow. null ONLY if no follow-up is needed.
- product_interests: only from the listed slugs; [] if none mentioned.
- Tamil or Tamil-English transcripts: answer in English.
- Keep every list to 3-4 items max.

Customer: ${leadName ?? "Unknown"} (${phoneNumber})

Transcript:
${transcript}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in combined response");
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    if (!parsed.analysis || !parsed.lead) {
      throw new Error("Combined response missing a section");
    }

    // Reuse the battle-tested per-section parsers/validators.
    const analysis = parseAnalysisResponse(JSON.stringify(parsed.analysis));
    const details = parseLeadDetailsResponse(JSON.stringify(parsed.lead));
    log("Combined call analysis complete", {
      sentiment: analysis.insights.sentiment,
      next_action: details.next_action,
    });
    return { analysis, details };
  } catch (error) {
    logError("Combined analysis failed — falling back to two calls", error);
    const analysis = await analyzeTranscript(transcript, phoneNumber, leadName);
    const details = await extractLeadDetails(transcript, phoneNumber, leadName);
    return { analysis, details };
  }
}
