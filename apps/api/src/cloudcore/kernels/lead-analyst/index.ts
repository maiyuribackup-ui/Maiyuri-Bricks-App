/**
 * Lead Analyst Kernel
 * Orchestrates lead analysis including summarization, scoring, and suggestions
 * Uses Claude for reasoning
 */

import * as claude from '../../services/ai/claude';
import * as db from '../../services/supabase';
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
} from '../../types';

export const KERNEL_CONFIG = {
  name: 'LeadAnalyst',
  description: 'Analyzes leads and provides actionable insights',
  version: '1.0.0',
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
  temperature: 0.7,
};

/**
 * Analyze a lead based on the request type
 */
export async function analyze(
  request: LeadAnalysisRequest
): Promise<CloudCoreResult<LeadAnalysisResponse>> {
  const startTime = Date.now();

  try {
    // Fetch lead and notes
    const [leadResult, notesResult] = await Promise.all([
      db.getLead(request.leadId),
      db.getNotes(request.leadId),
    ]);

    if (!leadResult.success || !leadResult.data) {
      return {
        success: false,
        data: null,
        error: {
          code: 'LEAD_NOT_FOUND',
          message: `Lead not found: ${request.leadId}`,
        },
      };
    }

    const lead = leadResult.data;
    const notes = notesResult.data || [];
    const maxNotes = request.options?.maxNotesToAnalyze || 10;
    const recentNotes = notes.slice(0, maxNotes);

    // Build response based on analysis type
    const response: LeadAnalysisResponse = {
      leadId: request.leadId,
    };

    switch (request.analysisType) {
      case 'full_analysis':
        await runFullAnalysis(lead, recentNotes, response, request);
        break;

      case 'summary_only':
        response.summary = await generateSummary(lead, recentNotes, 500, request.language || 'en');
        break;

      case 'scoring_only':
        response.score = await generateScore(lead, recentNotes, request);
        break;

      case 'suggestions_only':
        response.suggestions = await generateSuggestions(lead, recentNotes, request.language || 'en');
        break;

      case 'quick_update':
        await runQuickUpdate(lead, recentNotes.slice(0, 3), response, request.language || 'en');
        break;

      default:
        return {
          success: false,
          data: null,
          error: {
            code: 'INVALID_ANALYSIS_TYPE',
            message: `Unknown analysis type: ${request.analysisType}`,
          },
        };
    }

    // Persist AI fields to database
    if (response.summary || response.score || response.suggestions) {
      response.updatedFields = buildUpdatedFields(response);
      await db.updateLeadAI(request.leadId, {
        ai_summary: response.summary?.text,
        ai_score: response.score?.value,
        next_action: response.suggestions?.nextBestAction,
        follow_up_date: response.suggestions?.suggestedFollowUpDate,
      });
    }

    return {
      success: true,
      data: response,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Lead analysis error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'LEAD_ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Lead analysis failed',
      },
    };
  }
}

/**
 * Run full analysis (summary + score + suggestions)
 */
async function runFullAnalysis(
  lead: Lead,
  notes: Note[],
  response: LeadAnalysisResponse,
  request: LeadAnalysisRequest
): Promise<void> {
  const language = request.language || 'en';
  // Run all analyses in parallel
  const [summary, score, suggestions] = await Promise.all([
    generateSummary(lead, notes, 500, language),
    generateScore(lead, notes, request),
    generateSuggestions(lead, notes, language),
  ]);

  response.summary = summary;
  response.score = score;
  response.suggestions = suggestions;
}

/**
 * Run quick update (summary + suggestions only)
 */
async function runQuickUpdate(
  lead: Lead,
  notes: Note[],
  response: LeadAnalysisResponse,
  language: 'en' | 'ta' = 'en'
): Promise<void> {
  const [summary, suggestions] = await Promise.all([
    generateSummary(lead, notes, 200, language),
    generateSuggestions(lead, notes, language),
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
  maxLength: number = 500,
  language: 'en' | 'ta' = 'en'
): Promise<LeadSummary> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);

  const languageInstruction = language === 'ta'
    ? '\n\nIMPORTANT: Respond entirely in Tamil (தமிழ்). All text must be in Tamil script.'
    : '';

  const result = await claude.completeJson<{
    summary: string;
    highlights: string[];
    actionItems: string[];
    keyDates?: string[];
    sentiment?: string;
  }>({
    systemPrompt: `You are a sales assistant summarizing lead interactions for a brick manufacturing business.
Create a concise summary (max ${maxLength} characters) focusing on:
- Key discussion points
- Customer requirements
- Next steps and action items
- Important dates or commitments${languageInstruction}`,
    userPrompt: `Summarize this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext || 'No notes available'}

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
      sentiment: result.data.sentiment as 'positive' | 'neutral' | 'negative' | undefined,
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
  request: LeadAnalysisRequest
): Promise<LeadScore> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);

  // Calculate basic metrics
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  const notesCount = notes.length;
  const interactionFrequency = daysSinceCreated > 0 ? notesCount / daysSinceCreated : 0;

  // Get historical data if requested
  let historicalContext = '';
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

  const result = await claude.generateScore(
    leadContext,
    notesContext,
    {
      daysSinceCreated,
      notesCount,
      interactionFrequency: parseFloat(interactionFrequency.toFixed(2)),
    }
  );

  if (result.success && result.data) {
    return {
      value: result.data.score,
      confidence: result.data.confidence,
      factors: result.data.factors.map((f) => ({
        name: f.factor,
        impact: f.impact as 'positive' | 'negative' | 'neutral',
        weight: f.weight,
      })),
      recommendation: result.data.recommendation,
    };
  }

  // Fallback to basic scoring
  return calculateBasicScore(lead, notes);
}

/**
 * Generate suggestions using Claude
 */
async function generateSuggestions(
  lead: Lead,
  notes: Note[],
  language: 'en' | 'ta' = 'en'
): Promise<LeadSuggestions> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);

  const result = await claude.generateSuggestions(leadContext, notesContext, language);

  if (result.success && result.data) {
    return {
      items: result.data.suggestions.map((s) => ({
        id: s.id,
        type: s.type as 'action' | 'response' | 'insight' | 'warning',
        content: s.content,
        priority: s.priority as 'high' | 'medium' | 'low',
        reasoning: s.reasoning,
      })),
      nextBestAction: result.data.nextBestAction,
      suggestedFollowUpDate: result.data.suggestedFollowUpDate,
      priority: determinePriority(lead),
    };
  }

  // Fallback
  return {
    items: [],
    nextBestAction: generateBasicNextAction(lead),
    priority: determinePriority(lead),
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
${lead.ai_summary ? `Current Summary: ${lead.ai_summary}` : ''}
${lead.ai_score ? `Current Score: ${lead.ai_score}` : ''}
${lead.next_action ? `Current Next Action: ${lead.next_action}` : ''}
${lead.follow_up_date ? `Follow-up Date: ${lead.follow_up_date}` : ''}`;
}

/**
 * Format notes for context
 */
function formatNotesContext(notes: Note[]): string {
  if (!notes.length) {
    return 'No notes available';
  }

  return notes
    .map(
      (note, i) =>
        `[${i + 1}] ${note.date}: ${note.text}${
          note.transcription_text ? ` (Transcribed: ${note.transcription_text})` : ''
        }`
    )
    .join('\n\n');
}

/**
 * Calculate basic score without AI
 */
function calculateBasicScore(lead: Lead, notes: Note[]): LeadScore {
  const factors: LeadScore['factors'] = [];
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
    impact: statusScore > 0.5 ? 'positive' : statusScore < 0.5 ? 'negative' : 'neutral',
    weight: 0.3,
  });
  baseScore = baseScore * 0.7 + statusScore * 0.3;

  if (notes.length >= 5) {
    factors.push({
      name: 'High engagement (5+ interactions)',
      impact: 'positive',
      weight: 0.2,
    });
    baseScore += 0.1;
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
    case 'hot':
      return 'Schedule a closing meeting';
    case 'new':
      return 'Make initial contact';
    case 'cold':
      return 'Consider re-engagement campaign';
    case 'follow_up':
      return 'Continue nurturing with follow-ups';
    default:
      return 'Review lead status';
  }
}

/**
 * Determine priority based on lead status
 */
function determinePriority(lead: Lead): 'high' | 'medium' | 'low' {
  if (lead.status === 'hot') return 'high';
  if (lead.status === 'follow_up') return 'medium';
  return 'low';
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
  }
  if (response.suggestions) {
    fields.next_action = response.suggestions.nextBestAction;
    fields.follow_up_date = response.suggestions.suggestedFollowUpDate;
  }

  return fields;
}

/**
 * Quick analyze - lighter weight analysis for real-time UI
 */
export async function quickAnalyze(
  leadId: string,
  options?: { language?: 'en' | 'ta' }
): Promise<CloudCoreResult<{ summary: string; score: number; nextAction: string }>> {
  const result = await analyze({
    leadId,
    analysisType: 'quick_update',
    language: options?.language || 'en',
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
      summary: result.data.summary?.text || '',
      score: result.data.score?.value || 0,
      nextAction: result.data.suggestions?.nextBestAction || '',
    },
    meta: result.meta,
  };
}

export default {
  analyze,
  quickAnalyze,
  KERNEL_CONFIG,
};
