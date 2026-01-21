/**
 * Lead Analyst Kernel
 * Orchestrates lead analysis including summarization, scoring, and suggestions
 * Uses Claude for reasoning
 */

import * as claude from "../../services/ai/claude";
import * as db from "../../services/supabase";
import * as insightBridge from "../../services/insight-knowledge-bridge";
import type {
  CloudCoreResult,
  KernelContext,
  LeadAnalysisRequest,
  LeadAnalysisResponse,
  LeadSummary,
  LeadScore,
  LeadSuggestions,
  Lead,
  Note,
  CallRecording,
} from "../../types";
import type { LeadUrgency, ConversionLever } from "@maiyuri/shared";

export const KERNEL_CONFIG = {
  name: "LeadAnalyst",
  description: "Analyzes leads and provides actionable insights",
  version: "1.0.0",
  defaultModel: "claude-sonnet-4-20250514",
  maxTokens: 2048,
  temperature: 0.7,
};

/**
 * Analyze a lead based on the request type
 */
export async function analyze(
  request: LeadAnalysisRequest,
): Promise<CloudCoreResult<LeadAnalysisResponse>> {
  const startTime = Date.now();

  try {
    // Fetch lead, notes, and call recordings in parallel
    const [leadResult, notesResult, callRecordingsResult] = await Promise.all([
      db.getLead(request.leadId),
      db.getNotes(request.leadId),
      db.getCallRecordings(request.leadId),
    ]);

    if (!leadResult.success || !leadResult.data) {
      return {
        success: false,
        data: null,
        error: {
          code: "LEAD_NOT_FOUND",
          message: `Lead not found: ${request.leadId}`,
        },
      };
    }

    const lead = leadResult.data;
    const notes = notesResult.data || [];
    const callRecordings = callRecordingsResult.data || [];
    const maxNotes = request.options?.maxNotesToAnalyze || 10;
    const recentNotes = notes.slice(0, maxNotes);
    const recentCallRecordings = callRecordings.slice(0, 5); // Limit to 5 most recent calls

    // Build response based on analysis type
    const response: LeadAnalysisResponse = {
      leadId: request.leadId,
    };

    switch (request.analysisType) {
      case "full_analysis":
        await runFullAnalysis(
          lead,
          recentNotes,
          recentCallRecordings,
          response,
          request,
        );
        break;

      case "summary_only":
        response.summary = await generateSummary(
          lead,
          recentNotes,
          recentCallRecordings,
          500,
          request.language || "en",
        );
        break;

      case "scoring_only":
        response.score = await generateScore(
          lead,
          recentNotes,
          recentCallRecordings,
          request,
        );
        break;

      case "suggestions_only":
        response.suggestions = await generateSuggestions(
          lead,
          recentNotes,
          recentCallRecordings,
          request.language || "en",
        );
        break;

      case "quick_update":
        await runQuickUpdate(
          lead,
          recentNotes.slice(0, 3),
          recentCallRecordings.slice(0, 2),
          response,
          request.language || "en",
        );
        break;

      default:
        return {
          success: false,
          data: null,
          error: {
            code: "INVALID_ANALYSIS_TYPE",
            message: `Unknown analysis type: ${request.analysisType}`,
          },
        };
    }

    // Persist AI fields to database
    if (
      response.summary ||
      response.score ||
      response.suggestions ||
      response.updatedFields ||
      response.smartQuotePayload
    ) {
      const fieldsToUpdate = buildUpdatedFields(response);
      response.updatedFields = { ...response.updatedFields, ...fieldsToUpdate };

      await db.updateLead(request.leadId, {
        ai_summary: response.summary?.text,
        ai_score: response.score?.value,
        next_action: response.suggestions?.nextBestAction,
        follow_up_date: response.suggestions?.suggestedFollowUpDate,
        // New intelligence fields
        urgency: response.updatedFields?.urgency,
        dominant_objection: response.updatedFields?.dominant_objection,
        best_conversion_lever: response.updatedFields?.best_conversion_lever,
        // SmartQuotePayload for personalized quote experiences
        smart_quote_payload: response.smartQuotePayload,
      });

      // Bridge insights to knowledge base (fire-and-forget, don't block response)
      insightBridge
        .processLeadInsight({
          leadId: request.leadId,
          dominantObjection: response.updatedFields?.dominant_objection,
          bestConversionLever: response.updatedFields?.best_conversion_lever,
          suggestions: response.suggestions?.items,
          aiSummary: response.summary?.text,
        })
        .catch((err) => {
          console.error(
            "[LeadAnalyst] Error bridging insights to knowledge:",
            err,
          );
        });
    }

    return {
      success: true,
      data: response,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("Lead analysis error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "LEAD_ANALYSIS_ERROR",
        message:
          error instanceof Error ? error.message : "Lead analysis failed",
      },
    };
  }
}

/**
 * Run full analysis (summary + score + suggestions + intelligence extraction + SmartQuotePayload)
 */
async function runFullAnalysis(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[],
  response: LeadAnalysisResponse,
  request: LeadAnalysisRequest,
): Promise<void> {
  const language = request.language || "en";
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);
  const callContext = formatCallRecordingsContext(callRecordings);

  // Step 1: Run primary analyses in parallel
  const [summary, score, suggestions, intelligence] = await Promise.all([
    generateSummary(lead, notes, callRecordings, 500, language),
    generateScore(lead, notes, callRecordings, request),
    generateSuggestions(lead, notes, callRecordings, language),
    extractLeadIntelligence(lead, notes, callRecordings),
  ]);

  response.summary = summary;
  response.score = score;
  response.suggestions = suggestions;

  // Merge intelligence fields into updatedFields
  if (intelligence) {
    response.updatedFields = {
      ...response.updatedFields,
      urgency: intelligence.urgency,
      dominant_objection: intelligence.dominantObjection,
      best_conversion_lever: intelligence.bestConversionLever,
    };
  }

  // Step 2: Generate SmartQuotePayload AFTER primary analyses complete
  // This allows it to use the analysis results for deterministic mapping
  const existingAnalysis = {
    factors: score?.factors?.map((f) => ({
      factor: f.name,
      impact: f.impact,
    })),
    suggestions: suggestions?.items?.map((s) => ({
      type: s.type,
      content: s.content,
    })),
    status: lead.status,
    nextAction: suggestions?.nextBestAction,
  };

  const smartQuotePayloadResult = await claude.generateSmartQuotePayload(
    leadContext,
    notesContext,
    callContext,
    existingAnalysis,
  );

  // Add SmartQuotePayload if generation was successful
  if (smartQuotePayloadResult.success && smartQuotePayloadResult.data) {
    response.smartQuotePayload = smartQuotePayloadResult.data;
  } else {
    // Log error for debugging SmartQuotePayload generation failures
    console.error(
      "[SmartQuotePayload] Generation failed for lead:",
      response.leadId,
      "Error:",
      smartQuotePayloadResult.error,
    );
  }
}

/**
 * Run quick update (summary + suggestions only)
 */
async function runQuickUpdate(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[],
  response: LeadAnalysisResponse,
  language: "en" | "ta" = "en",
): Promise<void> {
  const [summary, suggestions] = await Promise.all([
    generateSummary(lead, notes, callRecordings, 200, language),
    generateSuggestions(lead, notes, callRecordings, language),
  ]);

  response.summary = summary;
  response.suggestions = suggestions;
}

/**
 * Generate lead summary using Claude
 */
async function generateSummary(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[],
  maxLength: number = 500,
  language: "en" | "ta" = "en",
): Promise<LeadSummary> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);
  const callContext = formatCallRecordingsContext(callRecordings);

  const languageInstruction =
    language === "ta"
      ? "\n\nIMPORTANT: Respond entirely in Tamil (தமிழ்). All text must be in Tamil script."
      : "";

  const result = await claude.completeJson<{
    summary: string;
    highlights: string[];
    actionItems: string[];
    keyDates?: string[];
    sentiment?: string;
  }>({
    systemPrompt: `You are a sales assistant summarizing lead interactions for a brick manufacturing business.
Create a concise summary (max ${maxLength} characters) focusing on:
- Key discussion points from notes AND call recordings
- Customer requirements and objections
- Buying signals and price expectations
- Next steps and action items
- Important dates or commitments${languageInstruction}`,
    userPrompt: `Summarize this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION NOTES:
${notesContext || "No notes available"}

CALL RECORDINGS ANALYSIS:
${callContext || "No call recordings available"}

Respond with JSON:
{
  "summary": "Concise summary",
  "highlights": ["Key point 1", "Key point 2"],
  "actionItems": ["Action 1", "Action 2"],
  "keyDates": ["Important date 1"],
  "sentiment": "positive|neutral|negative"
}`,
    maxTokens: 1024,
    temperature: 0.5,
  });

  if (result.success && result.data) {
    return {
      text: result.data.summary,
      highlights: result.data.highlights || [],
      actionItems: result.data.actionItems || [],
      keyDates: result.data.keyDates,
      sentiment: result.data.sentiment as
        | "positive"
        | "neutral"
        | "negative"
        | undefined,
    };
  }

  // Fallback
  return {
    text: `Lead ${lead.name} - ${lead.status}`,
    highlights: [],
    actionItems: [],
  };
}

/**
 * Generate lead score using Claude
 */
async function generateScore(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[],
  request: LeadAnalysisRequest,
): Promise<LeadScore> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);
  const callContext = formatCallRecordingsContext(callRecordings);

  // Calculate basic metrics
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24),
  );
  const notesCount = notes.length;
  const callsCount = callRecordings.length;
  const interactionFrequency =
    daysSinceCreated > 0 ? (notesCount + callsCount) / daysSinceCreated : 0;

  // Calculate call-based signals
  const positiveCallSignals = callRecordings.filter(
    (c) =>
      c.ai_insights?.sentiment === "positive" ||
      (c.ai_insights?.positive_signals?.length || 0) > 0,
  ).length;
  const negativeCallSignals = callRecordings.filter(
    (c) =>
      c.ai_insights?.sentiment === "negative" ||
      (c.ai_insights?.complaints?.length || 0) > 0,
  ).length;

  // Get historical data if requested
  let historicalContext = "";
  if (request.options?.includeHistoricalData) {
    const [similarLeads, conversionRate] = await Promise.all([
      db.getSimilarLeads(lead.lead_type, lead.source),
      db.getConversionRate(lead.lead_type),
    ]);

    if (similarLeads.success && similarLeads.data) {
      historicalContext = `Similar leads: ${similarLeads.data.length}`;
    }
    if (conversionRate.success && conversionRate.data !== null) {
      historicalContext += `\nHistorical conversion rate: ${Math.round(conversionRate.data * 100)}%`;
    }
  }

  // Combine notes and call context for scoring
  const combinedContext = `${notesContext}\n\nCALL RECORDINGS:\n${callContext}`;

  const result = await claude.generateScore(leadContext, combinedContext, {
    daysSinceCreated,
    notesCount,
    callsCount,
    interactionFrequency: parseFloat(interactionFrequency.toFixed(2)),
    positiveCallSignals,
    negativeCallSignals,
  });

  if (result.success && result.data) {
    return {
      value: result.data.score,
      confidence: result.data.confidence,
      factors: result.data.factors.map((f) => ({
        name: f.factor,
        impact: f.impact as "positive" | "negative" | "neutral",
        weight: f.weight,
      })),
      recommendation: result.data.recommendation,
    };
  }

  // Fallback to basic scoring
  return calculateBasicScore(lead, notes, callRecordings);
}

/**
 * Generate suggestions using Claude
 */
async function generateSuggestions(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[],
  language: "en" | "ta" = "en",
): Promise<LeadSuggestions> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);
  const callContext = formatCallRecordingsContext(callRecordings);

  // Combine contexts for suggestions
  const combinedContext = `${notesContext}\n\nCALL RECORDINGS INSIGHTS:\n${callContext}`;

  const result = await claude.generateSuggestions(
    leadContext,
    combinedContext,
    language,
  );

  if (result.success && result.data) {
    return {
      items: result.data.suggestions.map((s) => ({
        id: s.id,
        type: s.type as "action" | "response" | "insight" | "warning",
        content: s.content,
        priority: s.priority as "high" | "medium" | "low",
        reasoning: s.reasoning,
      })),
      nextBestAction: result.data.nextBestAction,
      suggestedFollowUpDate: result.data.suggestedFollowUpDate,
      priority: determinePriority(lead, callRecordings),
    };
  }

  // Fallback
  return {
    items: [],
    nextBestAction: generateBasicNextAction(lead),
    priority: determinePriority(lead, callRecordings),
  };
}

/**
 * Format lead for context
 */
function formatLeadContext(lead: Lead): string {
  return `Name: ${lead.name}
Contact: ${lead.contact}
Source: ${lead.source}
Type: ${lead.lead_type}
Status: ${lead.status}
Created: ${lead.created_at}
${lead.ai_summary ? `Current Summary: ${lead.ai_summary}` : ""}
${lead.ai_score ? `Current Score: ${lead.ai_score}` : ""}
${lead.next_action ? `Current Next Action: ${lead.next_action}` : ""}
${lead.follow_up_date ? `Follow-up Date: ${lead.follow_up_date}` : ""}`;
}

/**
 * Format notes for context
 */
function formatNotesContext(notes: Note[]): string {
  if (!notes.length) {
    return "No notes available";
  }

  return notes
    .map(
      (note, i) =>
        `[${i + 1}] ${note.date}: ${note.text}${
          note.transcription_text
            ? ` (Transcribed: ${note.transcription_text})`
            : ""
        }`,
    )
    .join("\n\n");
}

/**
 * Format call recordings for context - extracts key insights for AI analysis
 */
function formatCallRecordingsContext(callRecordings: CallRecording[]): string {
  if (!callRecordings.length) {
    return "No call recordings available";
  }

  return callRecordings
    .map((call, i) => {
      const insights = call.ai_insights || {};
      const parts = [
        `[Call ${i + 1}] ${call.created_at}:`,
        call.ai_summary ? `Summary: ${call.ai_summary}` : "",
        insights.sentiment ? `Sentiment: ${insights.sentiment}` : "",
        insights.positive_signals?.length
          ? `Positive Signals: ${insights.positive_signals.join(", ")}`
          : "",
        insights.complaints?.length
          ? `Complaints: ${insights.complaints.join(", ")}`
          : "",
        insights.negative_feedback?.length
          ? `Concerns: ${insights.negative_feedback.join(", ")}`
          : "",
        insights.negotiation_signals?.length
          ? `Negotiation Signals: ${insights.negotiation_signals.join(", ")}`
          : "",
        insights.price_expectations?.length
          ? `Price Expectations: ${insights.price_expectations.join(", ")}`
          : "",
        insights.recommended_actions?.length
          ? `Recommended Actions: ${insights.recommended_actions.join(", ")}`
          : "",
        call.transcription_text
          ? `\nTranscript excerpt: ${call.transcription_text.slice(0, 500)}...`
          : "",
      ].filter(Boolean);

      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Extract lead intelligence fields from call recordings and notes
 */
async function extractLeadIntelligence(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[],
): Promise<{
  urgency: LeadUrgency | null;
  dominantObjection: string | null;
  bestConversionLever: ConversionLever | null;
} | null> {
  // If no call recordings, skip intelligence extraction
  if (!callRecordings.length && !notes.length) {
    return null;
  }

  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);
  const callContext = formatCallRecordingsContext(callRecordings);

  const result = await claude.completeJson<{
    urgency: string;
    dominant_objection: string | null;
    best_conversion_lever: string;
    reasoning: string;
  }>({
    systemPrompt: `You are a sales intelligence analyst for a brick manufacturing business.
Analyze the lead's interactions to extract structured intelligence that helps sales prioritize and close deals.

URGENCY LEVELS:
- immediate: Ready to buy within days/weeks, has active project, expressed urgency
- 1-3_months: Has timeline but not immediate, gathering quotes, planning phase
- 3-6_months: Early research, no immediate need, future project
- unknown: Cannot determine from available information

CONVERSION LEVERS:
- proof: Customer needs quality evidence, samples, references, testimonials
- price: Price is the main decision factor, comparing quotes, budget conscious
- visit: Customer wants to see factory, meet team, establish trust
- relationship: Personal relationship matters, needs rapport building
- timeline: Speed of delivery/execution is critical factor`,
    userPrompt: `Extract intelligence from this lead's interactions:

LEAD INFORMATION:
${leadContext}

INTERACTION NOTES:
${notesContext || "No notes available"}

CALL RECORDINGS ANALYSIS:
${callContext || "No call recordings available"}

Respond with JSON:
{
  "urgency": "immediate|1-3_months|3-6_months|unknown",
  "dominant_objection": "The main barrier preventing purchase (null if none identified)",
  "best_conversion_lever": "proof|price|visit|relationship|timeline",
  "reasoning": "Brief explanation of your analysis"
}`,
    maxTokens: 512,
    temperature: 0.3,
  });

  if (result.success && result.data) {
    return {
      urgency: result.data.urgency as LeadUrgency,
      dominantObjection: result.data.dominant_objection,
      bestConversionLever: result.data.best_conversion_lever as ConversionLever,
    };
  }

  return null;
}

/**
 * Calculate basic score without AI
 */
function calculateBasicScore(
  lead: Lead,
  notes: Note[],
  callRecordings: CallRecording[] = [],
): LeadScore {
  const factors: LeadScore["factors"] = [];
  let baseScore = 0.5;

  const statusScores: Record<string, number> = {
    hot: 0.8,
    follow_up: 0.6,
    new: 0.5,
    cold: 0.3,
    converted: 1.0,
    lost: 0.0,
  };

  const statusScore = statusScores[lead.status] || 0.5;
  factors.push({
    name: `Lead status: ${lead.status}`,
    impact:
      statusScore > 0.5
        ? "positive"
        : statusScore < 0.5
          ? "negative"
          : "neutral",
    weight: 0.3,
  });
  baseScore = baseScore * 0.7 + statusScore * 0.3;

  const totalInteractions = notes.length + callRecordings.length;
  if (totalInteractions >= 5) {
    factors.push({
      name: `High engagement (${totalInteractions} interactions)`,
      impact: "positive",
      weight: 0.2,
    });
    baseScore += 0.1;
  }

  // Boost for call recordings (indicates serious interest)
  if (callRecordings.length > 0) {
    factors.push({
      name: `Has ${callRecordings.length} call recording(s)`,
      impact: "positive",
      weight: 0.15,
    });
    baseScore += 0.05 * Math.min(callRecordings.length, 3);
  }

  // Check for positive signals in calls
  const positiveCallCount = callRecordings.filter(
    (c) => c.ai_insights?.sentiment === "positive",
  ).length;
  if (positiveCallCount > 0) {
    factors.push({
      name: `${positiveCallCount} positive call sentiment(s)`,
      impact: "positive",
      weight: 0.15,
    });
    baseScore += 0.05 * positiveCallCount;
  }

  return {
    value: Math.max(0, Math.min(1, baseScore)),
    confidence: 0.6,
    factors,
    recommendation: generateBasicNextAction(lead),
  };
}

/**
 * Generate basic next action
 */
function generateBasicNextAction(lead: Lead): string {
  switch (lead.status) {
    case "hot":
      return "Schedule a closing meeting";
    case "new":
      return "Make initial contact";
    case "cold":
      return "Consider re-engagement campaign";
    case "follow_up":
      return "Continue nurturing with follow-ups";
    default:
      return "Review lead status";
  }
}

/**
 * Determine priority based on lead status and call recordings
 */
function determinePriority(
  lead: Lead,
  callRecordings: CallRecording[] = [],
): "high" | "medium" | "low" {
  // Check for urgency signals in call recordings
  const hasUrgentCall = callRecordings.some((c) =>
    c.ai_insights?.positive_signals?.some(
      (s) =>
        s.toLowerCase().includes("urgent") ||
        s.toLowerCase().includes("immediate"),
    ),
  );

  if (lead.status === "hot" || hasUrgentCall) return "high";
  if (lead.status === "follow_up" || callRecordings.length > 0) return "medium";
  return "low";
}

/**
 * Build updated fields for database
 */
function buildUpdatedFields(response: LeadAnalysisResponse): Partial<Lead> {
  const fields: Partial<Lead> = {};

  if (response.summary) {
    fields.ai_summary = response.summary.text;
  }
  if (response.score) {
    fields.ai_score = response.score.value;
    fields.ai_factors = response.score.factors.map((factor) => ({
      factor: factor.name,
      impact: factor.impact,
    }));
  }
  if (response.suggestions) {
    fields.next_action = response.suggestions.nextBestAction;
    fields.follow_up_date = response.suggestions.suggestedFollowUpDate;
    fields.ai_suggestions = response.suggestions.items.map((suggestion) => ({
      type: suggestion.type,
      content: suggestion.content,
      priority: suggestion.priority,
    }));
  }

  return fields;
}

/**
 * Quick analyze - lighter weight analysis for real-time UI
 */
export async function quickAnalyze(
  leadId: string,
  options?: { language?: "en" | "ta" },
): Promise<
  CloudCoreResult<{ summary: string; score: number; nextAction: string }>
> {
  const result = await analyze({
    leadId,
    analysisType: "quick_update",
    language: options?.language || "en",
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error,
    };
  }

  return {
    success: true,
    data: {
      summary: result.data.summary?.text || "",
      score: result.data.score?.value || 0,
      nextAction: result.data.suggestions?.nextBestAction || "",
    },
    meta: result.meta,
  };
}

export default {
  analyze,
  quickAnalyze,
  KERNEL_CONFIG,
};
