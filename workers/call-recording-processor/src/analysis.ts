/**
 * AI Analysis Service
 *
 * Analyzes call transcripts to extract insights, signals, and recommendations.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { log, logError } from "./logger.js";

// Types
interface CallInsights {
  complaints?: string[];
  negative_feedback?: string[];
  negotiation_signals?: string[];
  price_expectations?: string[];
  positive_signals?: string[];
  recommended_actions?: string[];
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
}

interface AnalysisResult {
  summary: string;
  insights: CallInsights;
  scoreImpact: number;
}

/**
 * Get Gemini client
 */
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
- Positive signals, clear requirements, budget discussion → positive impact
- Complaints, strong price objections, competitor preference → negative impact
- If transcript is in Tamil, provide insights in English
- Focus on actionable intelligence for the sales team
- Keep lists concise (max 3-4 items each)

Customer: ${leadName || "Unknown"} (${phoneNumber})

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON from response
    const analysis = parseAnalysisResponse(response);

    log("Analysis complete", {
      sentiment: analysis.insights.sentiment,
      scoreImpact: analysis.scoreImpact,
    });

    return analysis;
  } catch (error) {
    logError("Analysis failed", error);

    // Return default analysis on failure
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

/**
 * Parse the analysis response and extract structured data
 */
function parseAnalysisResponse(response: string): AnalysisResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Validate and structure the response
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

    // Return minimal valid response
    return {
      summary: response.slice(0, 500), // Use raw response as summary
      insights: {
        sentiment: "neutral",
      },
      scoreImpact: 0,
    };
  }
}

/**
 * Ensure value is array of strings
 */
function ensureStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return undefined;
  return value.filter((v) => typeof v === "string").slice(0, 5);
}

/**
 * Validate sentiment value
 */
function validateSentiment(
  value: unknown,
): "positive" | "negative" | "neutral" | "mixed" {
  const valid = ["positive", "negative", "neutral", "mixed"];
  return valid.includes(String(value))
    ? (String(value) as "positive" | "negative" | "neutral" | "mixed")
    : "neutral";
}

/**
 * Clamp number to range
 */
function clampNumber(value: unknown, min: number, max: number): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(min, Math.min(max, num));
}

/**
 * Lead details extracted from transcript for auto-population
 */
export interface ExtractedLeadDetails {
  lead_type:
    | "Residential"
    | "Commercial"
    | "Industrial"
    | "Government"
    | "Other";
  classification:
    | "builder"
    | "dealer"
    | "architect"
    | "direct_customer"
    | "contractor"
    | "engineer";
  requirement_type:
    | "residential_house"
    | "commercial_building"
    | "compound_wall"
    | "industrial_shed"
    | "government_project"
    | "other"
    | null;
  site_region: string | null;
  site_location: string | null;
  next_action: string | null;
  estimated_quantity: number | null;
  notes: string | null;
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `You are analyzing a sales call transcript for Maiyuri Bricks (CSEB/interlocking brick manufacturer in Tamil Nadu, India).

Extract lead information from this call in JSON format:

\`\`\`json
{
  "lead_type": "Residential|Commercial|Industrial|Government|Other",
  "classification": "builder|dealer|architect|direct_customer|contractor|engineer",
  "requirement_type": "residential_house|commercial_building|compound_wall|industrial_shed|government_project|other",
  "site_region": "Chennai|Coimbatore|Madurai|Salem|Trichy|Tirupur|Erode|Vellore|Thanjavur|Other",
  "site_location": "specific location/area if mentioned",
  "next_action": "recommended next step",
  "estimated_quantity": null or number of bricks if mentioned,
  "notes": "any important context about the customer's requirements"
}
\`\`\`

Guidelines:
- lead_type: What type of project? (House=Residential, Shop/Office=Commercial, Factory=Industrial, Govt tender=Government)
- classification: Who is the customer? (Builder builds for others, direct_customer for themselves, dealer for reselling)
- requirement_type: Main purpose of bricks needed
- site_region: Tamil Nadu district/city if mentioned
- site_location: Specific area, street, or village name if mentioned
- next_action: What should sales team do next? (e.g., "Schedule site visit", "Send quotation", "Call back next week")
- estimated_quantity: Number of bricks if customer mentioned (e.g., "10000 bricks" → 10000)
- notes: Key requirements, timeline, special requests

If information is not in the transcript, use null for optional fields.
If unsure between options, make your best guess based on context.
If the transcript is in Tamil, still provide the response in English.

Customer: ${leadName || "Unknown"} (${phoneNumber})

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse the JSON response
    const details = parseLeadDetailsResponse(response);

    log("Lead details extracted", {
      lead_type: details.lead_type,
      classification: details.classification,
      site_region: details.site_region,
    });

    return details;
  } catch (error) {
    logError("Failed to extract lead details", error);

    // Return defaults on failure
    return {
      lead_type: "Other",
      classification: "direct_customer",
      requirement_type: null,
      site_region: null,
      site_location: null,
      next_action: "Follow up with customer",
      estimated_quantity: null,
      notes: null,
    };
  }
}

/**
 * Parse lead details response from AI
 */
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

    // Validate and map the response
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
      site_region:
        typeof parsed.site_region === "string" ? parsed.site_region : null,
      site_location:
        typeof parsed.site_location === "string" ? parsed.site_location : null,
      next_action:
        typeof parsed.next_action === "string" ? parsed.next_action : null,
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
      site_region: null,
      site_location: null,
      next_action: null,
      estimated_quantity: null,
      notes: null,
    };
  }
}

/**
 * Generate quick assessment without full analysis
 */
export async function quickAssessment(transcript: string): Promise<{
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  urgency: "high" | "medium" | "low";
}> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Quickly assess this sales call:

1. Overall sentiment: positive, negative, neutral, or mixed?
2. Urgency to follow up: high, medium, or low?

Reply in format: SENTIMENT, URGENCY

Transcript:
${transcript.slice(0, 2000)}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().toLowerCase();

    let sentiment: "positive" | "negative" | "neutral" | "mixed" = "neutral";
    let urgency: "high" | "medium" | "low" = "medium";

    if (response.includes("positive")) sentiment = "positive";
    else if (response.includes("negative")) sentiment = "negative";
    else if (response.includes("mixed")) sentiment = "mixed";

    if (response.includes("high")) urgency = "high";
    else if (response.includes("low")) urgency = "low";

    return { sentiment, urgency };
  } catch {
    return { sentiment: "neutral", urgency: "medium" };
  }
}
