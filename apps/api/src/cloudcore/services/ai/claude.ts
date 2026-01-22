/**
 * Claude Service
 * Used for reasoning, analysis, scoring, and decision support
 * Model: claude-sonnet-4-20250514
 *
 * Instrumented with Langfuse observability for tracing and cost tracking.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  ClaudeModels,
  type TokenUsage,
  type CloudCoreResult,
} from "../../types";
import {
  getLanguageInstruction,
  type LanguageCode,
} from "../../utils/language";
import {
  createTrace,
  calculateCost,
  flushObservability,
  type TraceContext,
} from "../../../services/observability";

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

// Default configuration
const DEFAULT_MODEL = ClaudeModels.SONNET;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;

export interface ClaudeCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: keyof typeof ClaudeModels;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Optional trace context for observability correlation */
  traceContext?: {
    traceId?: string;
    userId?: string;
    leadId?: string;
    agentType?: string;
  };
}

export interface ClaudeCompletionResponse {
  content: string;
  usage: TokenUsage;
  stopReason: string;
}

/**
 * Generate a completion using Claude
 * Instrumented with Langfuse observability for tracing and cost tracking.
 */
export async function complete(
  request: ClaudeCompletionRequest,
): Promise<CloudCoreResult<ClaudeCompletionResponse>> {
  const startTime = Date.now();
  const model = request.model ? ClaudeModels[request.model] : DEFAULT_MODEL;

  // Always create trace for observability (auto-generate context if not provided)
  const traceId =
    request.traceContext?.traceId ||
    `claude-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const agentType = request.traceContext?.agentType || "claude-completion";

  const trace = createTrace({
    traceId,
    userId: request.traceContext?.userId,
    leadId: request.traceContext?.leadId,
    agentType,
  });

  // Create generation span for this LLM call
  const generation = trace?.generation({
    name: agentType,
    model,
    input: {
      system: request.systemPrompt,
      user: request.userPrompt,
    },
    metadata: {
      maxTokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? DEFAULT_TEMPERATURE,
      jsonMode: request.jsonMode || false,
    },
  });

  try {
    const maxTokens = request.maxTokens || DEFAULT_MAX_TOKENS;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;

    // Add JSON instruction if jsonMode is enabled
    let systemPrompt = request.systemPrompt;
    if (request.jsonMode) {
      systemPrompt +=
        "\n\nIMPORTANT: Respond ONLY with valid JSON. No other text or explanation.";
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === "text");
    const content = textContent?.type === "text" ? textContent.text : "";

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      model,
    };

    const processingTime = Date.now() - startTime;
    const cost = calculateCost(
      model,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    // End generation with success
    generation?.end({
      output: content,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      metadata: {
        cost,
        latencyMs: processingTime,
        stopReason: response.stop_reason,
        provider: "claude",
      },
    });

    // Flush observability data (non-blocking)
    flushObservability().catch(() => {});

    return {
      success: true,
      data: {
        content,
        usage,
        stopReason: response.stop_reason || "unknown",
      },
      meta: {
        processingTime,
        usage,
        cost,
      },
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Claude completion failed";

    // Log error to trace
    generation?.end({
      level: "ERROR",
      statusMessage: errorMessage,
      metadata: {
        latencyMs: processingTime,
        errorType: error instanceof Error ? error.name : "UnknownError",
        provider: "claude",
      },
    });

    console.error("Claude completion error:", error);
    console.warn(
      "Claude API failed, attempting fallback...",
      error instanceof Error ? error.message : error,
    );

    // Fallback to Gemini
    console.log("🔄 Swapping to Fallback: Gemini");
    try {
      const geminiResult = await gemini.complete({
        prompt: `${request.systemPrompt}\n\n${request.userPrompt}`,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });

      if (geminiResult.success && geminiResult.data) {
        // Log fallback success to trace
        trace?.event({
          name: "fallback-success",
          metadata: {
            fallbackProvider: "gemini",
            originalError: errorMessage,
          },
        });

        // Flush observability data (non-blocking)
        flushObservability().catch(() => {});

        return {
          success: true,
          data: {
            content: geminiResult.data.content,
            usage: {
              inputTokens: geminiResult.data.usage?.inputTokens ?? 0,
              outputTokens: geminiResult.data.usage?.outputTokens ?? 0,
              totalTokens: geminiResult.data.usage?.totalTokens ?? 0,
              model: "gemini-2.5-flash-preview-05-20",
            },
            stopReason: "stop",
          },
          meta: {
            processingTime: Date.now() - startTime,
            provider: "gemini(fallback)",
          },
        };
      }
      console.warn("Gemini fallback also failed:", geminiResult.error);
    } catch (geminiError) {
      console.error("Gemini fallback error:", geminiError);
    }

    // Flush observability data (non-blocking)
    flushObservability().catch(() => {});

    // Return original error if Gemini also fails
    return {
      success: false,
      data: null,
      error: {
        code: "CLAUDE_COMPLETION_ERROR",
        message: errorMessage,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

// Import fallback providers
import * as gemini from "./gemini";
import * as openai from "./openai";

/**
 * Generate a JSON completion using Claude with Fallback Support
 * Chain: Claude -> Gemini -> OpenAI
 */
export async function completeJson<T>(
  request: Omit<ClaudeCompletionRequest, "jsonMode">,
): Promise<CloudCoreResult<T>> {
  // 1. Try Claude (Primary)
  const result = await complete({ ...request, jsonMode: true });

  if (result.success && result.data) {
    try {
      // Try to extract JSON from the response
      const content = result.data.content.trim();
      let jsonStr = content;

      if (content.startsWith("```json")) {
        jsonStr = content.slice(7, content.lastIndexOf("```")).trim();
      } else if (content.startsWith("```")) {
        jsonStr = content.slice(3, content.lastIndexOf("```")).trim();
      }

      const parsed = JSON.parse(jsonStr) as T;
      return { success: true, data: parsed, meta: result.meta };
    } catch (parseError) {
      console.warn(
        "Claude JSON parse error, attempting fallback...",
        parseError,
      );
      // Proceed to fallback if parsing fails
    }
  } else {
    console.warn("Claude API failed, attempting fallback...", result.error);
  }

  // 2. Try Gemini (Fallback 1)
  console.log("🔄 Swapping to Fallback: Gemini");
  const geminiResult = await gemini.completeJson<T>({
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  });

  if (geminiResult.success && geminiResult.data) {
    return {
      success: true,
      data: geminiResult.data,
      meta: {
        processingTime: geminiResult.meta?.processingTime || 0,
        provider: "gemini(fallback)",
        usage: geminiResult.meta?.usage,
      },
    };
  }
  console.warn(
    "Gemini fallback failed, attempting secondary fallback...",
    geminiResult.error,
  );

  // 3. Try OpenAI (Fallback 2)
  console.log("🔄 Swapping to Secondary Fallback: OpenAI");
  const openaiResult = await openai.completeJson<T>({
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  });

  if (openaiResult.success && openaiResult.data) {
    return {
      success: true,
      data: openaiResult.data,
      meta: {
        processingTime: openaiResult.meta?.processingTime || 0,
        provider: "openai(fallback)",
        usage: openaiResult.meta?.usage,
      },
    };
  }

  // All providers failed
  return {
    success: false,
    data: null,
    error: {
      code: "ALL_PROVIDERS_FAILED",
      message: "Claude, Gemini, and OpenAI all failed to complete the request.",
      details: {
        claudeError: result.error,
        geminiError: geminiResult.error,
        openaiError: openaiResult.error,
      },
    },
  };
}

/**
 * Analyze lead data using Claude
 */
export async function analyzeLead(
  leadContext: string,
  notesContext: string,
  analysisType: string,
): Promise<CloudCoreResult<Record<string, unknown>>> {
  const systemPrompt = `You are an expert sales analyst for a brick manufacturing business.
Your role is to analyze lead information and provide actionable insights.

Analysis Guidelines:
- Be concise but thorough
- Focus on conversion probability factors
- Identify key action items
- Consider the construction industry context
- Account for regional (Tamil Nadu, India) business practices`;

  const userPrompt = `Perform a ${analysisType} analysis on this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

Provide your analysis in the following JSON format:
{
  "summary": "Brief overview of the lead",
  "highlights": ["Key point 1", "Key point 2"],
  "actionItems": ["Action 1", "Action 2"],
  "conversionProbability": 0.75,
  "recommendedNextAction": "Specific action to take",
  "urgency": "high|medium|low"
}`;

  return completeJson<Record<string, unknown>>({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.5,
  });
}

/**
 * Generate scoring analysis using Claude
 */
export async function generateScore(
  leadContext: string,
  notesContext: string,
  metrics: Record<string, number>,
): Promise<
  CloudCoreResult<{
    score: number;
    confidence: number;
    factors: Array<{ factor: string; impact: string; weight: number }>;
    recommendation: string;
  }>
> {
  const systemPrompt = `You are a lead scoring expert for a brick manufacturing business.
Calculate conversion probability based on lead data and interaction history.

Scoring Factors:
- Engagement level (interaction frequency)
- Expressed urgency/timeline
- Budget indicators
- Decision-maker status
- Project specifics (size, type)
- Response timeliness
- Sentiment in notes`;

  const userPrompt = `Score this lead's conversion probability:

LEAD INFORMATION:
${leadContext}

METRICS:
${Object.entries(metrics)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "score": 0.75,
  "confidence": 0.85,
  "factors": [
    {"factor": "Description", "impact": "positive|negative|neutral", "weight": 0.2}
  ],
  "recommendation": "Specific recommendation"
}`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.3, // Lower temperature for more consistent scoring
  });
}

/**
 * Generate suggestions using Claude
 */
export async function generateSuggestions(
  leadContext: string,
  notesContext: string,
  language: LanguageCode = "en",
): Promise<
  CloudCoreResult<{
    suggestions: Array<{
      id: string;
      type: string;
      content: string;
      priority: string;
      reasoning: string;
    }>;
    nextBestAction: string;
    suggestedFollowUpDate: string;
  }>
> {
  const languageInstruction =
    language === "ta"
      ? "\n\nIMPORTANT: Respond entirely in Tamil (தமிழ்). All text must be in Tamil script."
      : "";

  const systemPrompt = `You are a sales advisor for a brick manufacturing business.
Generate actionable suggestions to help close leads.

Suggestion Types:
- action: Tasks to complete
- response: What to say to the lead
- insight: Observations about the lead
- warning: Potential issues to address${languageInstruction}`;

  const userPrompt = `Generate suggestions for this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "suggestions": [
    {
      "id": "uuid",
      "type": "action|response|insight|warning",
      "content": "Suggestion text",
      "priority": "high|medium|low",
      "reasoning": "Why this suggestion"
    }
  ],
  "nextBestAction": "Single most important action",
  "suggestedFollowUpDate": "YYYY-MM-DD"
}`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.7,
  });
}

/**
 * Generate coaching insights using Claude
 */
export async function generateCoachingInsights(
  staffContext: string,
  metricsContext: string,
  period: string,
  language: LanguageCode = "en",
): Promise<
  CloudCoreResult<{
    insights: Array<{
      type: string;
      title: string;
      description: string;
      metric?: string;
      value?: number;
    }>;
    recommendations: Array<{
      priority: string;
      area: string;
      action: string;
      expectedImpact: string;
    }>;
    overallScore: number;
  }>
> {
  const languageInstruction = getLanguageInstruction(language);

  const systemPrompt = `You are a sales performance coach for a brick manufacturing business.
Analyze staff performance and provide constructive feedback.

Focus Areas:
- Lead engagement quality
- Conversion success rate
- Response timeliness
- Follow-up discipline
- Note-taking quality

${languageInstruction}`;

  const userPrompt = `Generate coaching insights for this staff member (${period} period):

STAFF INFORMATION:
${staffContext}

PERFORMANCE METRICS:
${metricsContext}

Respond with JSON:
{
  "insights": [
    {
      "type": "strength|improvement|trend|alert",
      "title": "Brief title",
      "description": "Detailed insight",
      "metric": "metric name if applicable",
      "value": 0.0
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "area": "Focus area",
      "action": "Specific action",
      "expectedImpact": "Expected result"
    }
  ],
  "overallScore": 0.0
}`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1536,
    temperature: 0.6,
  });
}

/**
 * Generate SmartQuotePayload for personalized quotation experience
 * This payload drives the Smart Quote UI with personalized, customer-facing content
 */
export async function generateSmartQuotePayload(
  leadContext: string,
  notesContext: string,
  callRecordingsContext: string,
  existingAnalysis?: {
    factors?: Array<{ factor: string; impact: string }>;
    suggestions?: Array<{ type: string; content: string }>;
    status?: string;
    nextAction?: string;
  },
): Promise<
  CloudCoreResult<{
    language_default: "en" | "ta";
    persona: "homeowner" | "builder" | "architect" | "unknown";
    stage: "cold" | "warm" | "hot";
    primary_angle: "health" | "cooling" | "cost" | "sustainability" | "design";
    secondary_angle:
      | "health"
      | "cooling"
      | "cost"
      | "sustainability"
      | "design"
      | null;
    top_objections: Array<{
      type:
        | "price"
        | "strength"
        | "water"
        | "approval"
        | "maintenance"
        | "resale"
        | "contractor_acceptance";
      severity: "low" | "medium" | "high";
    }>;
    route_decision:
      | "site_visit"
      | "technical_call"
      | "cost_estimate"
      | "nurture";
    personalization_snippets: {
      en: { p1: string; p2?: string };
      ta: { p1: string; p2?: string };
    };
    competitor_context: {
      mentioned: boolean;
      tone: "curious" | "comparing" | "doubtful" | "none";
    };
  }>
> {
  // Build existing analysis context if available
  const existingAnalysisContext = existingAnalysis
    ? `
## EXISTING AI ANALYSIS (Use for mapping)
Factors: ${JSON.stringify(existingAnalysis.factors || [])}
Suggestions: ${JSON.stringify(existingAnalysis.suggestions || [])}
Status: ${existingAnalysis.status || "unknown"}
Next Action: ${existingAnalysis.nextAction || "none"}`
    : "";

  const systemPrompt = `You are a sales intelligence analyst for Maiyuri Bricks, a brick manufacturing company in Chennai.

Generate a SmartQuotePayload for personalized quotation presentation. This payload is CUSTOMER-FACING - no CRM jargon allowed.

## CONTEXT ABOUT MAIYURI BRICKS
- Products: Interlocking bricks (eco-friendly, no cement mortar needed)
- USPs: 30% cost savings, faster construction, thermal insulation, earthquake resistant
- Location: Chennai, Tamil Nadu
- Target: Homeowners, builders, architects in Tamil Nadu

## DETERMINISTIC MAPPING RULES (MUST APPLY)

### Stage Mapping
- If lead status = "hot" → stage: "hot"
- Else infer from intent phrases in transcript/notes

### Objection Mapping (from existing factors or transcript)
- Factor contains "Budget concerns" or mentions expensive → price (high)
- Mentions seepage, rain, damp, water → water
- Mentions approval, engineer, family decision → approval
- Mentions alternative builder, other brick brand → resale or contractor_acceptance
- MAX 2 objections only, ranked by severity

### Route Decision Mapping
- If nextAction mentions pricing, quote, cost → cost_estimate
- If suggestion contains "site visit", factory → site_visit
- If many technical questions in notes → technical_call
- Else → nurture
- Only ONE route_decision allowed

### Language Default
- If transcript/notes language is Tamil or mixed Tamil-English → ta
- Else → en

## PRIMARY & SECONDARY ANGLE SELECTION (AI must choose, not list)

Selection Logic based on keywords in transcript/notes:
- health, comfort, children, breathing, dust-free → "health"
- heat, AC, summer, cool, insulation → "cooling"
- budget, rate, comparison, savings, cost → "cost"
- eco, sustainability, green, environment → "sustainability"
- aesthetics, design, look, modern, finish → "design"

Primary = strongest signal from conversation
Secondary = second strongest signal
RULE: primary_angle MUST NOT equal secondary_angle

## PERSONALIZATION SNIPPETS (CRITICAL - Customer-facing)

These snippets appear directly in the Smart Quote shown to customer.

Rules:
- Max 2 sentences per language
- Max 15 words per sentence
- Must feel "made for me" - reference something specific from their conversation
- NO internal jargon (no "score", "factor", "priority", "conversion")
- NO raw data references
- Calm, premium tone - not salesy
- No hard selling or urgency pressure

Example (English):
"From your call, it's clear you're exploring an eco-friendly home that feels cooler and calmer inside."
"Your main concern is budget, so we'll focus on a smart range instead of confusing numbers."

Example (Tamil - Chennai conversational, NOT formal):
"உங்கள் அழைப்பில் இருந்து தெரிகிறது—சென்னையின் வெப்பத்தில் குளிர்ச்சியாகவும் அமைதியாகவும் இருக்கும் இயற்கை வீடு தான் உங்கள் முன்னுரிமை."
"உங்கள் முக்கிய கவலை பட்ஜெட் என்பதால், குழப்பம் இல்லாத 'ஸ்மார்ட் ரேஞ்ச்' மேல் தான் கவனம்."

Avoid formal/old Tamil. Keep conversational Chennai Tamil.

## COMPETITOR CONTEXT
- mentioned: true if ANY competitor brand mentioned (Porotherm, Wienerberger, etc.)
- tone: "curious" (just asking), "comparing" (active comparison), "doubtful" (skeptical of us), "none"

## STRICT OUTPUT RULES (NON-NEGOTIABLE)
- Output JSON only - no explanations, no markdown, no comments
- No hallucination - if unsure, reduce confidence, not fabricate
- If transcript is missing: infer cautiously, prefer cost_estimate or nurture, keep snippets generic but human

## VALIDATION CHECKLIST (Your output MUST pass)
✓ JSON matches schema exactly
✓ primary_angle ≠ secondary_angle
✓ max 2 objections
✓ route_decision is singular (one value only)
✓ personalization_snippets exist in BOTH en AND ta
✓ No CRM words visible ("score", "factor", "priority", "conversion", "lead")`;

  const userPrompt = `Analyze this lead and generate a SmartQuotePayload:

## LEAD INFORMATION
${leadContext}

## NOTES & INTERACTIONS (PRIMARY SOURCE)
${notesContext}

## CALL RECORDINGS INSIGHTS (PRIMARY SOURCE)
${callRecordingsContext}
${existingAnalysisContext}

Output ONLY valid JSON matching the SmartQuotePayload schema.`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.3, // Lower temperature for deterministic structured output
  });
}

export default {
  complete,
  completeJson,
  analyzeLead,
  generateScore,
  generateSuggestions,
  generateCoachingInsights,
  generateSmartQuotePayload,
};
