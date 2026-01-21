/**
 * Insight Knowledge Bridge Service
 * Connects AI-generated insights to the knowledge base
 * Auto-populates the pending knowledge queue from:
 * - Lead analysis objections
 * - AI suggestions
 * - Coaching insights
 * - Conversion playbooks
 */

import { supabase } from "../supabase";
import type { CloudCoreResult } from "../../types";

// Types for pending knowledge queue
export interface PendingKnowledgeEntry {
  id: string;
  source_type:
    | "objection"
    | "suggestion"
    | "coaching"
    | "conversion"
    | "call_summary";
  source_id: string | null;
  content: {
    question: string;
    suggestedAnswer: string | null;
    context: string | null;
    metadata: Record<string, unknown>;
  };
  frequency: number;
  status: "pending" | "approved" | "rejected" | "merged";
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_knowledge_id: string | null;
}

// Input types from AI systems
export interface LeadInsightInput {
  leadId: string;
  dominantObjection?: string | null;
  bestConversionLever?: string | null;
  suggestions?: Array<{
    type: string;
    content: string;
    priority: "high" | "medium" | "low";
    reasoning?: string;
  }>;
  aiSummary?: string;
}

export interface CoachingInsightInput {
  staffId: string;
  insightType: "correction" | "missed_opportunity" | "kudos";
  quoteText?: string;
  suggestion?: string;
  context?: string;
}

export interface ConversionInput {
  leadId: string;
  leadName: string;
  objectionOvercome?: string;
  conversionLever?: string;
  keyInteractions?: string[];
  winReason?: string;
}

export interface CallSummaryInput {
  callRecordingId: string;
  leadId: string;
  aiSummary: string;
  keyObjections?: string[];
  questionsAsked?: string[];
}

/**
 * Track an objection from lead analysis
 */
export async function trackObjection(
  objection: string,
  leadId: string,
  conversionLever?: string | null,
): Promise<CloudCoreResult<string>> {
  const startTime = Date.now();

  try {
    // Use the upsert_pending_knowledge function for deduplication
    const { data, error } = await supabase.rpc("upsert_pending_knowledge", {
      p_source_type: "objection",
      p_source_id: leadId,
      p_question: `How do I handle the objection: "${objection}"?`,
      p_suggested_answer: conversionLever
        ? `Recommended approach: Focus on ${conversionLever}`
        : null,
      p_context: `Objection detected from lead analysis`,
      p_metadata: {
        original_objection: objection,
        conversion_lever: conversionLever,
        detected_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw error;
    }

    console.log(
      `[InsightKnowledgeBridge] Tracked objection: "${objection}" -> ${data}`,
    );

    return {
      success: true,
      data: data as string,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("[InsightKnowledgeBridge] Error tracking objection:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "TRACK_OBJECTION_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to track objection",
      },
    };
  }
}

/**
 * Track a high-priority suggestion that could become knowledge
 */
export async function trackSuggestion(
  suggestion: {
    type: string;
    content: string;
    priority: "high" | "medium" | "low";
    reasoning?: string;
  },
  leadId: string,
): Promise<CloudCoreResult<string>> {
  const startTime = Date.now();

  try {
    // Only track high-priority suggestions
    if (suggestion.priority !== "high") {
      return {
        success: true,
        data: "skipped",
        meta: { processingTime: Date.now() - startTime },
      };
    }

    const { data, error } = await supabase.rpc("upsert_pending_knowledge", {
      p_source_type: "suggestion",
      p_source_id: leadId,
      p_question: `Best practice: ${suggestion.content}`,
      p_suggested_answer: suggestion.reasoning || null,
      p_context: `High-priority AI suggestion of type: ${suggestion.type}`,
      p_metadata: {
        suggestion_type: suggestion.type,
        original_content: suggestion.content,
        detected_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw error;
    }

    console.log(
      `[InsightKnowledgeBridge] Tracked suggestion: "${suggestion.content.slice(0, 50)}..."`,
    );

    return {
      success: true,
      data: data as string,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("[InsightKnowledgeBridge] Error tracking suggestion:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "TRACK_SUGGESTION_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to track suggestion",
      },
    };
  }
}

/**
 * Track a coaching insight that reveals knowledge gaps
 */
export async function trackCoachingInsight(
  insight: CoachingInsightInput,
): Promise<CloudCoreResult<string>> {
  const startTime = Date.now();

  try {
    // Only track missed opportunities and corrections (knowledge gaps)
    if (insight.insightType === "kudos") {
      return {
        success: true,
        data: "skipped",
        meta: { processingTime: Date.now() - startTime },
      };
    }

    const question =
      insight.insightType === "missed_opportunity"
        ? `Training gap: ${insight.suggestion || insight.quoteText}`
        : `Correction needed: ${insight.suggestion || insight.quoteText}`;

    const { data, error } = await supabase.rpc("upsert_pending_knowledge", {
      p_source_type: "coaching",
      p_source_id: insight.staffId,
      p_question: question,
      p_suggested_answer: insight.suggestion || null,
      p_context: insight.context || insight.quoteText || null,
      p_metadata: {
        insight_type: insight.insightType,
        staff_id: insight.staffId,
        quote_text: insight.quoteText,
        detected_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw error;
    }

    console.log(
      `[InsightKnowledgeBridge] Tracked coaching insight: ${insight.insightType}`,
    );

    return {
      success: true,
      data: data as string,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error(
      "[InsightKnowledgeBridge] Error tracking coaching insight:",
      error,
    );
    return {
      success: false,
      data: null,
      error: {
        code: "TRACK_COACHING_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to track coaching insight",
      },
    };
  }
}

/**
 * Generate a success playbook from a conversion
 */
export async function trackConversion(
  conversion: ConversionInput,
): Promise<CloudCoreResult<string>> {
  const startTime = Date.now();

  try {
    const question = conversion.objectionOvercome
      ? `Success Story: How we overcame "${conversion.objectionOvercome}" and closed ${conversion.leadName}`
      : `Success Story: How we closed ${conversion.leadName}`;

    const answerParts: string[] = [];
    if (conversion.winReason) {
      answerParts.push(`Win reason: ${conversion.winReason}`);
    }
    if (conversion.conversionLever) {
      answerParts.push(`Key lever: ${conversion.conversionLever}`);
    }
    if (conversion.keyInteractions?.length) {
      answerParts.push(
        `Key interactions: ${conversion.keyInteractions.join(", ")}`,
      );
    }

    const { data, error } = await supabase.rpc("upsert_pending_knowledge", {
      p_source_type: "conversion",
      p_source_id: conversion.leadId,
      p_question: question,
      p_suggested_answer:
        answerParts.length > 0 ? answerParts.join("\n") : null,
      p_context: `Conversion playbook extracted from successful deal`,
      p_metadata: {
        lead_id: conversion.leadId,
        lead_name: conversion.leadName,
        objection_overcome: conversion.objectionOvercome,
        conversion_lever: conversion.conversionLever,
        converted_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw error;
    }

    console.log(
      `[InsightKnowledgeBridge] Tracked conversion: ${conversion.leadName}`,
    );

    return {
      success: true,
      data: data as string,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("[InsightKnowledgeBridge] Error tracking conversion:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "TRACK_CONVERSION_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to track conversion",
      },
    };
  }
}

/**
 * Extract and track Q&A from call summaries
 */
export async function trackCallSummary(
  callSummary: CallSummaryInput,
): Promise<CloudCoreResult<string[]>> {
  const startTime = Date.now();
  const trackedIds: string[] = [];

  try {
    // Track key objections from the call
    if (callSummary.keyObjections?.length) {
      for (const objection of callSummary.keyObjections) {
        const result = await trackObjection(objection, callSummary.leadId);
        if (result.success && result.data && result.data !== "skipped") {
          trackedIds.push(result.data);
        }
      }
    }

    // Track questions asked by customers (potential FAQ entries)
    if (callSummary.questionsAsked?.length) {
      for (const question of callSummary.questionsAsked) {
        const { data, error } = await supabase.rpc("upsert_pending_knowledge", {
          p_source_type: "call_summary",
          p_source_id: callSummary.callRecordingId,
          p_question: question,
          p_suggested_answer: null, // Needs human answer
          p_context: `Question from customer call - needs answer`,
          p_metadata: {
            call_recording_id: callSummary.callRecordingId,
            lead_id: callSummary.leadId,
            extracted_at: new Date().toISOString(),
          },
        });

        if (!error && data) {
          trackedIds.push(data as string);
        }
      }
    }

    console.log(
      `[InsightKnowledgeBridge] Tracked ${trackedIds.length} items from call summary`,
    );

    return {
      success: true,
      data: trackedIds,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error(
      "[InsightKnowledgeBridge] Error tracking call summary:",
      error,
    );
    return {
      success: false,
      data: null,
      error: {
        code: "TRACK_CALL_SUMMARY_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to track call summary",
      },
    };
  }
}

/**
 * Process all insights from a lead analysis result
 * This is the main entry point called after lead analysis
 */
export async function processLeadInsight(
  insight: LeadInsightInput,
): Promise<CloudCoreResult<{ tracked: number; skipped: number }>> {
  const startTime = Date.now();
  let tracked = 0;
  let skipped = 0;

  try {
    // Track dominant objection
    if (insight.dominantObjection) {
      const result = await trackObjection(
        insight.dominantObjection,
        insight.leadId,
        insight.bestConversionLever,
      );
      if (result.success && result.data !== "skipped") {
        tracked++;
      } else {
        skipped++;
      }
    }

    // Track high-priority suggestions
    if (insight.suggestions?.length) {
      for (const suggestion of insight.suggestions) {
        const result = await trackSuggestion(suggestion, insight.leadId);
        if (result.success && result.data !== "skipped") {
          tracked++;
        } else {
          skipped++;
        }
      }
    }

    console.log(
      `[InsightKnowledgeBridge] Processed lead insight: ${tracked} tracked, ${skipped} skipped`,
    );

    return {
      success: true,
      data: { tracked, skipped },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error(
      "[InsightKnowledgeBridge] Error processing lead insight:",
      error,
    );
    return {
      success: false,
      data: null,
      error: {
        code: "PROCESS_LEAD_INSIGHT_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to process lead insight",
      },
    };
  }
}

/**
 * Get pending knowledge entries for admin review
 */
export async function getPendingQueue(options?: {
  sourceType?: PendingKnowledgeEntry["source_type"];
  limit?: number;
  offset?: number;
  sortBy?: "frequency" | "created_at";
}): Promise<CloudCoreResult<PendingKnowledgeEntry[]>> {
  const startTime = Date.now();

  try {
    let query = supabase
      .from("knowledge_pending_queue")
      .select("*")
      .eq("status", "pending");

    if (options?.sourceType) {
      query = query.eq("source_type", options.sourceType);
    }

    const sortColumn =
      options?.sortBy === "created_at" ? "created_at" : "frequency";
    query = query.order(sortColumn, { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 20) - 1,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: (data || []) as PendingKnowledgeEntry[],
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error(
      "[InsightKnowledgeBridge] Error getting pending queue:",
      error,
    );
    return {
      success: false,
      data: null,
      error: {
        code: "GET_PENDING_QUEUE_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to get pending queue",
      },
    };
  }
}

/**
 * Approve a pending entry and add to knowledge base
 */
export async function approveEntry(
  entryId: string,
  answer: string,
  reviewerId: string,
): Promise<CloudCoreResult<string>> {
  const startTime = Date.now();

  try {
    // Get the pending entry
    const { data: entry, error: getError } = await supabase
      .from("knowledge_pending_queue")
      .select("*")
      .eq("id", entryId)
      .single();

    if (getError || !entry) {
      throw getError || new Error("Entry not found");
    }

    // Create knowledge base entry
    const { data: kbEntry, error: kbError } = await supabase
      .from("knowledgebase")
      .insert({
        question_text: entry.content.question,
        answer_text: answer,
        confidence_score: 1.0,
        source_lead_id: entry.source_id,
        content_type: "ai_insight",
        metadata: {
          source_type: entry.source_type,
          original_context: entry.content.context,
          frequency: entry.frequency,
          approved_at: new Date().toISOString(),
          approved_by: reviewerId,
        },
      })
      .select()
      .single();

    if (kbError) {
      throw kbError;
    }

    // Update pending entry status
    const { error: updateError } = await supabase
      .from("knowledge_pending_queue")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
        approved_knowledge_id: kbEntry.id,
      })
      .eq("id", entryId);

    if (updateError) {
      throw updateError;
    }

    console.log(
      `[InsightKnowledgeBridge] Approved entry ${entryId} -> knowledge ${kbEntry.id}`,
    );

    return {
      success: true,
      data: kbEntry.id,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("[InsightKnowledgeBridge] Error approving entry:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "APPROVE_ENTRY_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to approve entry",
      },
    };
  }
}

/**
 * Reject a pending entry
 */
export async function rejectEntry(
  entryId: string,
  reviewerId: string,
): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from("knowledge_pending_queue")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
      })
      .eq("id", entryId);

    if (error) {
      throw error;
    }

    console.log(`[InsightKnowledgeBridge] Rejected entry ${entryId}`);

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("[InsightKnowledgeBridge] Error rejecting entry:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "REJECT_ENTRY_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to reject entry",
      },
    };
  }
}

/**
 * Get statistics for the pending queue
 */
export async function getQueueStats(): Promise<
  CloudCoreResult<{
    total: number;
    bySourceType: Record<string, number>;
    topFrequency: { question: string; frequency: number }[];
  }>
> {
  const startTime = Date.now();

  try {
    // Get all pending entries
    const { data: entries, error } = await supabase
      .from("knowledge_pending_queue")
      .select("source_type, content, frequency")
      .eq("status", "pending");

    if (error) {
      throw error;
    }

    const bySourceType: Record<string, number> = {};
    const frequencyMap: Map<string, { question: string; frequency: number }> =
      new Map();

    for (const entry of entries || []) {
      // Count by source type
      bySourceType[entry.source_type] =
        (bySourceType[entry.source_type] || 0) + 1;

      // Track top frequency
      const question = entry.content?.question || "Unknown";
      const existing = frequencyMap.get(question);
      if (!existing || entry.frequency > existing.frequency) {
        frequencyMap.set(question, { question, frequency: entry.frequency });
      }
    }

    // Sort by frequency and get top 10
    const topFrequency = Array.from(frequencyMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    return {
      success: true,
      data: {
        total: entries?.length || 0,
        bySourceType,
        topFrequency,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("[InsightKnowledgeBridge] Error getting queue stats:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "GET_QUEUE_STATS_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to get queue stats",
      },
    };
  }
}

export default {
  // Tracking functions (called by AI kernels)
  trackObjection,
  trackSuggestion,
  trackCoachingInsight,
  trackConversion,
  trackCallSummary,
  processLeadInsight,
  // Admin functions (called by API routes)
  getPendingQueue,
  approveEntry,
  rejectEntry,
  getQueueStats,
};
