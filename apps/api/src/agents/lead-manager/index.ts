import type { Lead, Note } from '@maiyuri/shared';
import { successResult, errorResult } from '../utils';
import { summarize } from '../summarization';
import { score } from '../scoring';
import { suggest } from '../suggestion';
import {
  readLead,
  readNotes,
  updateLeadAI,
  getSimilarLeads,
  getConversionRate,
} from '../tools/supabase-tools';
import type {
  AgentResult,
  LeadManagerInput,
  LeadManagerOutput,
  SummarizationOutput,
  ScoringOutput,
  SuggestionOutput,
} from '../types';

/**
 * Lead Manager Agent (Orchestrator)
 * Coordinates all sub-agents to provide comprehensive lead analysis
 */
export async function analyzeLead(
  input: LeadManagerInput
): Promise<AgentResult<LeadManagerOutput>> {
  const startTime = Date.now();

  try {
    const { lead, notes, requestType } = input;

    if (!lead || !lead.id) {
      return errorResult('Lead information is required');
    }

    const result: LeadManagerOutput = {
      leadId: lead.id,
      processingTime: 0,
    };

    // Run agents based on request type
    switch (requestType) {
      case 'full_analysis':
        await runFullAnalysis(lead, notes, result);
        break;

      case 'scoring_only':
        await runScoring(lead, notes, result);
        break;

      case 'suggestions_only':
        await runSuggestions(lead, notes, result);
        break;

      case 'quick_update':
        await runQuickUpdate(lead, notes, result);
        break;

      default:
        return errorResult(`Unknown request type: ${requestType}`);
    }

    // Calculate processing time
    result.processingTime = Date.now() - startTime;

    // Update lead in database with AI insights
    if (result.summary || result.score || result.suggestions) {
      await updateLeadAI(lead.id, {
        ai_summary: result.summary?.summary,
        ai_score: result.score?.score,
        next_action: result.suggestions?.nextBestAction,
        follow_up_date: result.suggestions?.suggestedFollowUpDate,
      });
    }

    return successResult(result);
  } catch (error) {
    console.error('Lead manager error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Lead analysis failed'
    );
  }
}

/**
 * Full analysis - runs all agents
 */
async function runFullAnalysis(
  lead: Lead,
  notes: Note[],
  result: LeadManagerOutput
): Promise<void> {
  // Run all agents in parallel
  const [summaryResult, scoreResult, suggestionResult] = await Promise.all([
    summarize({ notes, lead }),
    score({
      lead,
      notes,
      historicalData: await getHistoricalData(lead),
    }),
    suggest({ lead, notes }),
  ]);

  if (summaryResult.success && summaryResult.data) {
    result.summary = summaryResult.data;
  }

  if (scoreResult.success && scoreResult.data) {
    result.score = scoreResult.data;
  }

  if (suggestionResult.success && suggestionResult.data) {
    result.suggestions = suggestionResult.data;
  }

  // Generate updated lead object
  result.updatedLead = {
    ai_summary: result.summary?.summary,
    ai_score: result.score?.score,
    next_action: result.suggestions?.nextBestAction,
    follow_up_date: result.suggestions?.suggestedFollowUpDate,
  };
}

/**
 * Scoring only
 */
async function runScoring(
  lead: Lead,
  notes: Note[],
  result: LeadManagerOutput
): Promise<void> {
  const scoreResult = await score({
    lead,
    notes,
    historicalData: await getHistoricalData(lead),
  });

  if (scoreResult.success && scoreResult.data) {
    result.score = scoreResult.data;
    result.updatedLead = {
      ai_score: scoreResult.data.score,
    };
  }
}

/**
 * Suggestions only
 */
async function runSuggestions(
  lead: Lead,
  notes: Note[],
  result: LeadManagerOutput
): Promise<void> {
  const suggestionResult = await suggest({ lead, notes });

  if (suggestionResult.success && suggestionResult.data) {
    result.suggestions = suggestionResult.data;
    result.updatedLead = {
      next_action: suggestionResult.data.nextBestAction,
      follow_up_date: suggestionResult.data.suggestedFollowUpDate,
    };
  }
}

/**
 * Quick update - summarization and suggestions only
 */
async function runQuickUpdate(
  lead: Lead,
  notes: Note[],
  result: LeadManagerOutput
): Promise<void> {
  const [summaryResult, suggestionResult] = await Promise.all([
    summarize({ notes: notes.slice(0, 3), lead, maxLength: 200 }), // Last 3 notes, shorter summary
    suggest({ lead, notes }),
  ]);

  if (summaryResult.success && summaryResult.data) {
    result.summary = summaryResult.data;
  }

  if (suggestionResult.success && suggestionResult.data) {
    result.suggestions = suggestionResult.data;
  }

  result.updatedLead = {
    ai_summary: result.summary?.summary,
    next_action: result.suggestions?.nextBestAction,
  };
}

/**
 * Get historical data for scoring context
 */
async function getHistoricalData(lead: Lead) {
  try {
    const [similarLeads, conversionRate] = await Promise.all([
      getSimilarLeads(lead.lead_type, lead.source),
      getConversionRate(lead.lead_type),
    ]);

    return {
      similarLeads,
      conversionRate,
    };
  } catch (error) {
    console.error('Error getting historical data:', error);
    return undefined;
  }
}

/**
 * Analyze a lead by ID (fetches lead and notes automatically)
 */
export async function analyzeLeadById(
  leadId: string,
  requestType: LeadManagerInput['requestType'] = 'full_analysis'
): Promise<AgentResult<LeadManagerOutput>> {
  try {
    // Fetch lead and notes
    const [lead, notes] = await Promise.all([
      readLead(leadId),
      readNotes(leadId),
    ]);

    if (!lead) {
      return errorResult(`Lead not found: ${leadId}`);
    }

    return analyzeLead({
      lead,
      notes,
      requestType,
    });
  } catch (error) {
    console.error('Error analyzing lead by ID:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Failed to analyze lead'
    );
  }
}

export default {
  analyzeLead,
  analyzeLeadById,
};
