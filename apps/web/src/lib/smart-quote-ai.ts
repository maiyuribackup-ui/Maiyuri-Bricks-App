/**
 * Smart Quote AI Pipeline Service
 *
 * Implements the AI pipeline for generating personalized Smart Quotes:
 * - Prompt A: Lead Insight Extraction
 * - Prompt B: Strategy + Routing + Page Blocks
 * - Prompt C: Bilingual Copy Generation
 *
 * Uses Gemini 2.0 Flash for all AI operations.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  SmartQuoteLanguage,
  SmartQuoteStage,
  SmartQuoteRoute,
  SmartQuoteObjection,
  SmartQuoteObjectionType,
  SmartQuoteObjectionSeverity,
  SmartQuoteScores,
  SmartQuotePageConfig,
  SmartQuoteCopyMap,
  SmartQuotePageKey,
} from "@maiyuri/shared";

// ============================================================================
// Types
// ============================================================================

export interface LeadInsights {
  language_detected: SmartQuoteLanguage | "mixed" | "unknown";
  persona: "homeowner" | "builder" | "architect" | "unknown";
  stage: SmartQuoteStage;
  scores: SmartQuoteScores;
  primary_angle: string | null;
  secondary_angle: string | null;
  top_objections: SmartQuoteObjection[];
  risk_flags: string[];
}

export interface StrategyResult {
  language_default: SmartQuoteLanguage;
  route_decision: SmartQuoteRoute;
  page_config: SmartQuotePageConfig;
}

export interface SmartQuoteAIResult {
  insights: LeadInsights;
  strategy: StrategyResult;
  copyMap: SmartQuoteCopyMap;
}

// ============================================================================
// Gemini Client
// ============================================================================

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY environment variable");
  }

  return new GoogleGenerativeAI(apiKey);
}

// ============================================================================
// Prompt A: Lead Insight Extraction
// ============================================================================

const PROMPT_A_SYSTEM = `You are an expert sales analyst for eco-friendly home construction in Chennai.
Extract intent, persona, objections, and readiness from the transcript.
Return ONLY valid JSON matching the schema provided. No extra keys. No explanations.
If information is missing, use null and reduce confidence scores. Never hallucinate.`;

async function extractLeadInsights(
  transcript: string,
  leadName?: string | null,
): Promise<LeadInsights> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `${PROMPT_A_SYSTEM}

SCHEMA (must match exactly):
{
  "language_detected": "en|ta|mixed|unknown",
  "persona": "homeowner|builder|architect|unknown",
  "stage": "cold|warm|hot",
  "scores": {"interest":0,"urgency":0,"price_sensitivity":0,"trust":0},
  "primary_angle": "health|cooling|cost|sustainability|design",
  "secondary_angle": "health|cooling|cost|sustainability|design",
  "top_objections": [{"type":"price|strength|water|approval|maintenance|resale","severity":"low|medium|high"}],
  "risk_flags": ["negative_sentiment","trust_issue","abusive","none"]
}

Notes:
- scores should be integers from 0-100
- top_objections should have max 2 items
- risk_flags should be an array of any detected flags, or ["none"] if no risks

Customer Name: ${leadName ?? "Unknown"}
CITY: Chennai

TRANSCRIPT:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return parseInsightsResponse(response);
  } catch (error) {
    console.error("[SmartQuoteAI] Failed to extract insights:", error);
    return getDefaultInsights();
  }
}

function parseInsightsResponse(response: string): LeadInsights {
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
      language_detected: validateLanguageDetected(parsed.language_detected),
      persona: validatePersona(parsed.persona),
      stage: validateStage(parsed.stage),
      scores: validateScores(parsed.scores),
      primary_angle:
        typeof parsed.primary_angle === "string" ? parsed.primary_angle : null,
      secondary_angle:
        typeof parsed.secondary_angle === "string"
          ? parsed.secondary_angle
          : null,
      top_objections: validateObjections(parsed.top_objections),
      risk_flags: validateRiskFlags(parsed.risk_flags),
    };
  } catch (error) {
    console.error("[SmartQuoteAI] Failed to parse insights:", error);
    return getDefaultInsights();
  }
}

function getDefaultInsights(): LeadInsights {
  return {
    language_detected: "unknown",
    persona: "unknown",
    stage: "cold",
    scores: { interest: 50, urgency: 50, price_sensitivity: 50, trust: 50 },
    primary_angle: null,
    secondary_angle: null,
    top_objections: [],
    risk_flags: ["none"],
  };
}

// ============================================================================
// Prompt B: Strategy + Routing + Page Blocks
// ============================================================================

const PROMPT_B_SYSTEM = `You are a conversion strategist for premium eco-friendly homes.
Decide the Smart Quote narrative and route using progressive disclosure.
One CTA only. Choose blocks per page. Preserve curiosity by withholding deep technical details.
Return ONLY JSON matching the schema.`;

async function generateStrategy(
  insights: LeadInsights,
): Promise<StrategyResult> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `${PROMPT_B_SYSTEM}

LEAD_INSIGHTS_JSON:
${JSON.stringify(insights, null, 2)}

Available blocks per page:
- entry: hero_headline, belief_breaker, trust_anchor, cta_teaser
- climate: chennai_logic, breathability, controlled_mystery, micro_cta
- cost: range_frame, range_value, drivers, soft_compare, micro_cta
- objection: top_objection_answer, reassurance, controlled_mystery
- cta: single_cta, route_explainer, light_form

Route decision rules:
- hot stage + high urgency → site_visit
- warm stage + technical questions → technical_call
- price focused + warm → cost_estimate
- cold stage or low trust → nurture

Output schema:
{
  "language_default": "en|ta",
  "route_decision": "site_visit|technical_call|cost_estimate|nurture",
  "page_blocks": {
    "entry": ["hero_headline", "belief_breaker", "trust_anchor", "cta_teaser"],
    "climate": ["chennai_logic", "breathability", "micro_cta"],
    "cost": ["range_frame", "range_value", "drivers", "micro_cta"],
    "objection": ["top_objection_answer", "reassurance"],
    "cta": ["single_cta", "route_explainer", "light_form"]
  }
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return parseStrategyResponse(response, insights);
  } catch (error) {
    console.error("[SmartQuoteAI] Failed to generate strategy:", error);
    return getDefaultStrategy(insights);
  }
}

function parseStrategyResponse(
  response: string,
  insights: LeadInsights,
): StrategyResult {
  try {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const pageBlocks = parsed.page_blocks || {};

    return {
      language_default: validateLanguageDefault(
        parsed.language_default,
        insights.language_detected,
      ),
      route_decision: validateRouteDecision(parsed.route_decision),
      page_config: {
        pages: [
          {
            key: "entry" as SmartQuotePageKey,
            blocks:
              ensureStringArray(pageBlocks.entry) ?? getDefaultBlocks("entry"),
          },
          {
            key: "climate" as SmartQuotePageKey,
            blocks:
              ensureStringArray(pageBlocks.climate) ??
              getDefaultBlocks("climate"),
          },
          {
            key: "cost" as SmartQuotePageKey,
            blocks:
              ensureStringArray(pageBlocks.cost) ?? getDefaultBlocks("cost"),
          },
          {
            key: "objection" as SmartQuotePageKey,
            blocks:
              ensureStringArray(pageBlocks.objection) ??
              getDefaultBlocks("objection"),
          },
          {
            key: "cta" as SmartQuotePageKey,
            blocks:
              ensureStringArray(pageBlocks.cta) ?? getDefaultBlocks("cta"),
          },
        ],
      },
    };
  } catch (error) {
    console.error("[SmartQuoteAI] Failed to parse strategy:", error);
    return getDefaultStrategy(insights);
  }
}

function getDefaultStrategy(insights: LeadInsights): StrategyResult {
  // Determine default language from insights
  const langDefault: SmartQuoteLanguage =
    insights.language_detected === "ta" ? "ta" : "en";

  // Determine default route from stage/scores
  let route: SmartQuoteRoute = "nurture";
  if (insights.stage === "hot" && insights.scores.urgency >= 70) {
    route = "site_visit";
  } else if (insights.stage === "warm") {
    if (insights.scores.price_sensitivity >= 70) {
      route = "cost_estimate";
    } else {
      route = "technical_call";
    }
  }

  return {
    language_default: langDefault,
    route_decision: route,
    page_config: {
      pages: [
        { key: "entry", blocks: getDefaultBlocks("entry") },
        { key: "climate", blocks: getDefaultBlocks("climate") },
        { key: "cost", blocks: getDefaultBlocks("cost") },
        { key: "objection", blocks: getDefaultBlocks("objection") },
        { key: "cta", blocks: getDefaultBlocks("cta") },
      ],
    },
  };
}

function getDefaultBlocks(pageKey: SmartQuotePageKey): string[] {
  const defaults: Record<SmartQuotePageKey, string[]> = {
    entry: ["hero_headline", "belief_breaker", "trust_anchor", "cta_teaser"],
    climate: ["chennai_logic", "breathability", "micro_cta"],
    cost: ["range_frame", "range_value", "drivers", "micro_cta"],
    objection: ["top_objection_answer", "reassurance"],
    cta: ["single_cta", "route_explainer", "light_form"],
  };
  return defaults[pageKey] ?? [];
}

// ============================================================================
// Prompt C: Bilingual Copy Generation
// ============================================================================

const PROMPT_C_SYSTEM = `You are a premium brand copywriter for Maiyuri Bricks.
Write calm, confident, conversion-focused microcopy.
Avoid hype, avoid long paragraphs.
Must produce both English and Tamil versions.
No technical dumping. Keep curiosity.
Return ONLY JSON.`;

async function generateBilingualCopy(
  insights: LeadInsights,
  strategy: StrategyResult,
): Promise<SmartQuoteCopyMap> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const topObjectionStr =
    insights.top_objections.length > 0
      ? insights.top_objections
          .map((o) => `${o.type} (${o.severity})`)
          .join(", ")
      : "none specified";

  const prompt = `${PROMPT_C_SYSTEM}

INPUT:
- Lead persona: ${insights.persona}
- Primary angle: ${insights.primary_angle ?? "general"}
- Secondary angle: ${insights.secondary_angle ?? "none"}
- Top objection(s): ${topObjectionStr}
- Route decision: ${strategy.route_decision}
- Stage: ${insights.stage}

Create copy for these keys:
entry.hero_headline
entry.belief_breaker
entry.trust_anchor
entry.primary_cta

climate.section_headline
climate.core_insight
climate.micro_cta

cost.section_headline
cost.range_frame
cost.range_placeholder (use ₹X–₹Y format)
cost.drivers
cost.micro_cta

objection.section_headline
objection.answer (only for top objection: ${insights.top_objections[0]?.type ?? "general concerns"})
objection.reassurance

cta.section_headline
cta.primary_cta
cta.route_explainer
cta.form_name_label
cta.form_phone_label
cta.form_locality_label

Guidelines:
- Keep headlines under 10 words
- Body text should be 1-2 short sentences max
- Use "you/your" for customer focus
- Tamil should be natural conversational Tamil, not formal/literary
- CTA text should match the route (site_visit → "See if it fits your plot", technical_call → "Talk to a specialist", cost_estimate → "Get a smart cost estimate", nurture → "Learn more")

Return schema:
{
  "en": { "entry.hero_headline": "...", "entry.belief_breaker": "...", ... },
  "ta": { "entry.hero_headline": "...", "entry.belief_breaker": "...", ... }
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return parseCopyResponse(response, strategy.route_decision);
  } catch (error) {
    console.error("[SmartQuoteAI] Failed to generate copy:", error);
    return getDefaultCopyMap(strategy.route_decision);
  }
}

function parseCopyResponse(
  response: string,
  route: SmartQuoteRoute,
): SmartQuoteCopyMap {
  try {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Validate we have both en and ta
    const en = parsed.en && typeof parsed.en === "object" ? parsed.en : {};
    const ta = parsed.ta && typeof parsed.ta === "object" ? parsed.ta : {};

    // Ensure all keys are strings
    const validateCopy = (
      copy: Record<string, unknown>,
    ): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(copy)) {
        if (typeof value === "string") {
          result[key] = value;
        }
      }
      return result;
    };

    const validatedEn = validateCopy(en);
    const validatedTa = validateCopy(ta);

    // Merge with defaults to ensure all required keys exist
    const defaultCopy = getDefaultCopyMap(route);

    return {
      en: { ...defaultCopy.en, ...validatedEn },
      ta: { ...defaultCopy.ta, ...validatedTa },
    };
  } catch (error) {
    console.error("[SmartQuoteAI] Failed to parse copy:", error);
    return getDefaultCopyMap(route);
  }
}

function getDefaultCopyMap(route: SmartQuoteRoute): SmartQuoteCopyMap {
  const ctaText: Record<SmartQuoteRoute, { en: string; ta: string }> = {
    site_visit: {
      en: "See if it fits your plot",
      ta: "உங்கள் மனைக்கு பொருந்துமா பாருங்கள்",
    },
    technical_call: { en: "Talk to a specialist", ta: "நிபுணரிடம் பேசுங்கள்" },
    cost_estimate: {
      en: "Get a smart cost estimate",
      ta: "செலவு மதிப்பீடு பெறுங்கள்",
    },
    nurture: { en: "Learn more", ta: "மேலும் அறிய" },
  };

  return {
    en: {
      "entry.hero_headline": "Build cooler. Build healthier.",
      "entry.belief_breaker": "What if your walls could breathe?",
      "entry.trust_anchor": "Trusted by 500+ Chennai families",
      "entry.primary_cta": ctaText[route].en,
      "climate.section_headline": "Made for Chennai summers",
      "climate.core_insight":
        "Earth blocks naturally regulate indoor temperature, keeping your home 3-5°C cooler.",
      "climate.micro_cta": "See how it works",
      "cost.section_headline": "What does it really cost?",
      "cost.range_frame":
        "Your home size and design drive the final price. Here's a realistic range:",
      "cost.range_placeholder": "₹45–₹55 per sq.ft",
      "cost.drivers":
        "Final cost depends on design complexity, location, and finish quality.",
      "cost.micro_cta": "Get your estimate",
      "objection.section_headline": "You might be wondering...",
      "objection.answer":
        "Earth blocks have been tested and proven for decades. They're stronger than you think.",
      "objection.reassurance": "We'll show you real examples when you visit.",
      "cta.section_headline": "Ready to explore?",
      "cta.primary_cta": ctaText[route].en,
      "cta.route_explainer": "Takes just 2-3 minutes. No pressure.",
      "cta.form_name_label": "Your name",
      "cta.form_phone_label": "Phone number",
      "cta.form_locality_label": "Your locality",
    },
    ta: {
      "entry.hero_headline":
        "குளிர்ச்சியாக கட்டுங்கள். ஆரோக்கியமாக கட்டுங்கள்.",
      "entry.belief_breaker": "உங்கள் சுவர்கள் மூச்சு விடக்கூடுமென்றால்?",
      "entry.trust_anchor": "500+ சென்னை குடும்பங்களால் நம்பப்படுகிறது",
      "entry.primary_cta": ctaText[route].ta,
      "climate.section_headline": "சென்னை கோடைக்காக உருவாக்கப்பட்டது",
      "climate.core_insight":
        "மண் செங்கற்கள் இயற்கையாகவே வெப்பநிலையை சீர்படுத்தி, உங்கள் வீட்டை 3-5°C குளிர்ச்சியாக வைக்கின்றன.",
      "climate.micro_cta": "எப்படி வேலை செய்கிறது பாருங்கள்",
      "cost.section_headline": "உண்மையில் எவ்வளவு செலவாகும்?",
      "cost.range_frame":
        "உங்கள் வீட்டின் அளவும் வடிவமைப்பும் இறுதி விலையை தீர்மானிக்கும்:",
      "cost.range_placeholder": "₹45–₹55 ஒரு சதுர அடிக்கு",
      "cost.drivers":
        "இறுதி செலவு வடிவமைப்பு சிக்கலானது, இடம் மற்றும் முடிவு தரத்தைப் பொறுத்தது.",
      "cost.micro_cta": "உங்கள் மதிப்பீட்டைப் பெறுங்கள்",
      "objection.section_headline": "நீங்கள் யோசிக்கலாம்...",
      "objection.answer":
        "மண் செங்கற்கள் பல தசாப்தங்களாக சோதிக்கப்பட்டு நிரூபிக்கப்பட்டுள்ளன. அவை நீங்கள் நினைப்பதை விட வலுவானவை.",
      "objection.reassurance":
        "நீங்கள் வரும்போது உண்மையான உதாரணங்களைக் காட்டுவோம்.",
      "cta.section_headline": "ஆராய தயாரா?",
      "cta.primary_cta": ctaText[route].ta,
      "cta.route_explainer": "2-3 நிமிடங்கள் மட்டுமே. எந்த அழுத்தமும் இல்லை.",
      "cta.form_name_label": "உங்கள் பெயர்",
      "cta.form_phone_label": "தொலைபேசி எண்",
      "cta.form_locality_label": "உங்கள் பகுதி",
    },
  };
}

// ============================================================================
// Main Pipeline Function
// ============================================================================

/**
 * Generate Smart Quote content from transcript
 *
 * Runs the 3-step AI pipeline:
 * 1. Extract lead insights from transcript
 * 2. Generate strategy and page configuration
 * 3. Generate bilingual copy
 *
 * @param transcript - The call recording transcript text
 * @param leadName - Optional lead name for personalization
 * @returns Complete Smart Quote AI result with insights, strategy, and copy
 */
export async function generateSmartQuoteContent(
  transcript: string,
  leadName?: string | null,
): Promise<SmartQuoteAIResult> {
  console.log(
    "[SmartQuoteAI] Starting pipeline for lead:",
    leadName ?? "Unknown",
  );

  // Step 1: Extract insights
  console.log("[SmartQuoteAI] Step 1: Extracting insights...");
  const insights = await extractLeadInsights(transcript, leadName);
  console.log("[SmartQuoteAI] Insights extracted:", {
    persona: insights.persona,
    stage: insights.stage,
    language: insights.language_detected,
  });

  // Step 2: Generate strategy
  console.log("[SmartQuoteAI] Step 2: Generating strategy...");
  const strategy = await generateStrategy(insights);
  console.log("[SmartQuoteAI] Strategy generated:", {
    route: strategy.route_decision,
    language: strategy.language_default,
  });

  // Step 3: Generate bilingual copy
  console.log("[SmartQuoteAI] Step 3: Generating bilingual copy...");
  const copyMap = await generateBilingualCopy(insights, strategy);
  console.log(
    "[SmartQuoteAI] Copy generated for",
    Object.keys(copyMap.en).length,
    "keys",
  );

  console.log("[SmartQuoteAI] Pipeline complete");

  return { insights, strategy, copyMap };
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateLanguageDetected(
  value: unknown,
): SmartQuoteLanguage | "mixed" | "unknown" {
  const valid = ["en", "ta", "mixed", "unknown"];
  return valid.includes(String(value))
    ? (String(value) as SmartQuoteLanguage | "mixed" | "unknown")
    : "unknown";
}

function validateLanguageDefault(
  value: unknown,
  detected: SmartQuoteLanguage | "mixed" | "unknown",
): SmartQuoteLanguage {
  if (value === "en" || value === "ta") return value;
  // Fall back to detected language or English
  return detected === "ta" ? "ta" : "en";
}

function validatePersona(
  value: unknown,
): "homeowner" | "builder" | "architect" | "unknown" {
  const valid = ["homeowner", "builder", "architect", "unknown"];
  return valid.includes(String(value))
    ? (String(value) as "homeowner" | "builder" | "architect" | "unknown")
    : "unknown";
}

function validateStage(value: unknown): SmartQuoteStage {
  const valid = ["cold", "warm", "hot"];
  return valid.includes(String(value))
    ? (String(value) as SmartQuoteStage)
    : "cold";
}

function validateScores(value: unknown): SmartQuoteScores {
  const defaultScores: SmartQuoteScores = {
    interest: 50,
    urgency: 50,
    price_sensitivity: 50,
    trust: 50,
  };

  if (!value || typeof value !== "object") return defaultScores;

  const scores = value as Record<string, unknown>;

  return {
    interest: clampNumber(scores.interest, 0, 100),
    urgency: clampNumber(scores.urgency, 0, 100),
    price_sensitivity: clampNumber(scores.price_sensitivity, 0, 100),
    trust: clampNumber(scores.trust, 0, 100),
  };
}

function validateObjections(value: unknown): SmartQuoteObjection[] {
  if (!Array.isArray(value)) return [];

  const validTypes: SmartQuoteObjectionType[] = [
    "price",
    "strength",
    "water",
    "approval",
    "maintenance",
    "resale",
  ];
  const validSeverities: SmartQuoteObjectionSeverity[] = [
    "low",
    "medium",
    "high",
  ];

  return value
    .filter((obj): obj is { type: string; severity: string } => {
      return (
        obj && typeof obj === "object" && "type" in obj && "severity" in obj
      );
    })
    .filter(
      (obj) =>
        validTypes.includes(obj.type as SmartQuoteObjectionType) &&
        validSeverities.includes(obj.severity as SmartQuoteObjectionSeverity),
    )
    .map((obj) => ({
      type: obj.type as SmartQuoteObjectionType,
      severity: obj.severity as SmartQuoteObjectionSeverity,
    }))
    .slice(0, 2); // Max 2 objections
}

function validateRiskFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return ["none"];
  const validFlags = ["negative_sentiment", "trust_issue", "abusive", "none"];
  const flags = value.filter(
    (v): v is string => typeof v === "string" && validFlags.includes(v),
  );
  return flags.length > 0 ? flags : ["none"];
}

function validateRouteDecision(value: unknown): SmartQuoteRoute {
  const valid: SmartQuoteRoute[] = [
    "site_visit",
    "technical_call",
    "cost_estimate",
    "nurture",
  ];
  return valid.includes(value as SmartQuoteRoute)
    ? (value as SmartQuoteRoute)
    : "nurture";
}

function ensureStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const filtered = value.filter((v): v is string => typeof v === "string");
  return filtered.length > 0 ? filtered : null;
}

function clampNumber(value: unknown, min: number, max: number): number {
  const num = Number(value);
  if (isNaN(num)) return Math.floor((min + max) / 2);
  return Math.max(min, Math.min(max, Math.round(num)));
}

// ============================================================================
// Slug Generation
// ============================================================================

/**
 * Generate a URL-safe random slug for Smart Quote links
 * Uses base62 encoding (alphanumeric only) for 12 characters
 * 62^12 = 3.2×10²¹ combinations (virtually unguessable)
 */
export function generateLinkSlug(length: number = 12): string {
  const chars =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += chars[randomValues[i] % chars.length];
  }

  return slug;
}
