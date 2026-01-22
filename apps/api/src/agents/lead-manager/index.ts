import type { Lead, Note } from "@maiyuri/shared";
import { v4 as uuidv4 } from "uuid";
import { successResult, errorResult } from "../utils";
import { summarize } from "../summarization";
import { score } from "../scoring";
import { suggest } from "../suggestion";
import {
  readLead,
  readNotes,
  updateLeadAI,
  getSimilarLeads,
  getConversionRate,
} from "../tools/supabase-tools";
import type {
  AgentResult,
  LeadManagerInput,
  LeadManagerOutput,
  SummarizationOutput,
  ScoringOutput,
  SuggestionOutput,
} from "../types";
import {
  createTrace,
  flushObservability,
  scoreTrace,
  logEvent,
} from "../../services/observability";

/**
 * Lead Manager Agent (Orchestrator)
 * Coordinates all sub-agents to provide comprehensive lead analysis
 */
export async function analyzeLead(
  input: LeadManagerInput,
): Promise<AgentResult<LeadManagerOutput>> {
  const startTime = Date.now();
  const traceId = input.traceContext?.traceId || uuidv4();

  // Create trace for observability
  const trace = createTrace({
    traceId,
    userId: input.traceContext?.userId,
    leadId: input.lead?.id,
    agentType: "lead-manager",
    sessionId: input.traceContext?.sessionId,
    tags: ["lead-analysis", input.requestType],
    metadata: {
      requestType: input.requestType,
      noteCount: input.notes?.length ?? 0,
      ...input.traceContext?.metadata,
    },
  });

  try {
    const { lead, notes, requestType } = input;

    if (!lead || !lead.id) {
      // Log validation error
      logEvent(
        traceId,
        "validation-error",
        { reason: "Missing lead information" },
        "ERROR",
      );
      return errorResult("Lead information is required");
    }

    const result: LeadManagerOutput = {
      leadId: lead.id,
      processingTime: 0,
    };

    // Create span for agent orchestration
    const orchestrationSpan = trace?.span({
      name: `orchestrate-${requestType}`,
      metadata: { requestType, leadId: lead.id },
    });

    // Run agents based on request type
    switch (requestType) {
      case "full_analysis":
        await runFullAnalysis(lead, notes, result);
        break;

      case "scoring_only":
        await runScoring(lead, notes, result);
        break;

      case "suggestions_only":
        await runSuggestions(lead, notes, result);
        break;

      case "quick_update":
        await runQuickUpdate(lead, notes, result);
        break;

      default:
        orchestrationSpan?.end({
          level: "ERROR",
          statusMessage: `Unknown request type: ${requestType}`,
        });
        return errorResult(`Unknown request type: ${requestType}`);
    }

    // End orchestration span
    orchestrationSpan?.end({
      metadata: {
        hasSummary: Boolean(result.summary),
        hasScore: Boolean(result.score),
        hasSuggestions: Boolean(result.suggestions),
      },
    });

    // Calculate processing time
    result.processingTime = Date.now() - startTime;

    // Update lead in database with AI insights
    if (result.summary || result.score || result.suggestions) {
      const dbSpan = trace?.span({ name: "update-lead-db" });
      await updateLeadAI(lead.id, {
        ai_summary: result.summary?.summary,
        ai_score: result.score?.score,
        next_action: result.suggestions?.nextBestAction,
        follow_up_date: result.suggestions?.suggestedFollowUpDate,
      });
      dbSpan?.end();
    }

    // Update trace with success summary
    trace?.update({
      output: {
        score: result.score?.score,
        hasAction: Boolean(result.suggestions?.nextBestAction),
      },
      metadata: {
        status: "success",
        processingTime: result.processingTime,
        agentsRun: [
          result.summary ? "summarization" : null,
          result.score ? "scoring" : null,
          result.suggestions ? "suggestion" : null,
        ].filter(Boolean),
      },
    });

    // Score trace for quality tracking (optional)
    if (result.score?.score) {
      scoreTrace(
        traceId,
        "lead-score",
        result.score.score,
        "AI-generated lead score",
      );
    }

    // Flush observability (non-blocking)
    flushObservability().catch(() => {});

    return successResult(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Lead analysis failed";

    // Log error to trace
    trace?.update({
      metadata: {
        status: "error",
        errorMessage,
        processingTime: Date.now() - startTime,
      },
    });

    // Log error event
    logEvent(traceId, "analysis-error", { error: errorMessage }, "ERROR");

    // Flush observability (non-blocking)
    flushObservability().catch(() => {});

    console.error("Lead manager error:", error);
    return errorResult(errorMessage);
  }
}

/**
 * Full analysis - runs all agents
 */
async function runFullAnalysis(
  lead: Lead,
  notes: Note[],
  result: LeadManagerOutput,
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
  result: LeadManagerOutput,
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
  result: LeadManagerOutput,
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
  result: LeadManagerOutput,
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
    console.error("Error getting historical data:", error);
    return undefined;
  }
}

/**
 * Analyze a lead by ID (fetches lead and notes automatically)
 */
export async function analyzeLeadById(
  leadId: string,
  requestType: LeadManagerInput["requestType"] = "full_analysis",
  traceContext?: LeadManagerInput["traceContext"],
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
      traceContext,
    });
  } catch (error) {
    console.error("Error analyzing lead by ID:", error);
    return errorResult(
      error instanceof Error ? error.message : "Failed to analyze lead",
    );
  }
}

export default {
  analyzeLead,
  analyzeLeadById,
};
