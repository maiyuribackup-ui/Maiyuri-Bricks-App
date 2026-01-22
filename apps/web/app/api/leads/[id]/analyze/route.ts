import { NextRequest } from "next/server";
import { kernels, services } from "@maiyuri/api";
import { success, error, notFound } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import { notifyAIAnalysis } from "@/lib/telegram";
import type { Lead, NudgeEventType } from "@maiyuri/shared";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

// Hot lead threshold (80% score)
const HOT_LEAD_THRESHOLD = 0.8;
// Significant score change threshold (10%)
const SCORE_CHANGE_THRESHOLD = 0.1;

/**
 * Trigger event-driven nudge (non-blocking)
 */
async function triggerEventNudge(
  eventType: NudgeEventType,
  leadId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await fetch(`${APP_URL}/api/nudges/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        lead_id: leadId,
        metadata,
      }),
    });
    if (!response.ok) {
      console.error(
        `[Event Nudge] Failed to trigger ${eventType}:`,
        await response.text(),
      );
    }
  } catch (err) {
    console.error(`[Event Nudge] Error triggering ${eventType}:`, err);
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Helper to get user's language preference
async function getUserLanguagePreference(
  request: NextRequest,
): Promise<"en" | "ta"> {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) return "en";

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("language_preference")
      .eq("id", authUser.id)
      .single();

    return (user?.language_preference as "en" | "ta") || "en";
  } catch {
    return "en";
  }
}

function normalizeTaskTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function toIsoDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function getDueDate(
  priority: "high" | "medium" | "low",
  fallbackDate?: string,
): string | undefined {
  const parsedFallback = toIsoDate(fallbackDate);
  if (parsedFallback) return parsedFallback;

  const dayOffsets: Record<"high" | "medium" | "low", number> = {
    high: 1,
    medium: 3,
    low: 7,
  };
  return new Date(
    Date.now() + dayOffsets[priority] * 24 * 60 * 60 * 1000,
  ).toISOString();
}

async function createTasksFromAnalysis(
  lead: Lead,
  analysis: {
    suggestions?: {
      items?: Array<{
        type: string;
        content: string;
        priority: "high" | "medium" | "low";
        reasoning?: string;
      }>;
      nextBestAction?: string;
      suggestedFollowUpDate?: string;
    };
  },
) {
  const supabase = getSupabaseAdmin();
  const { data: existingTasks } = await supabase
    .from("tasks")
    .select("title, status")
    .eq("lead_id", lead.id)
    .neq("status", "done");

  const existingTitles = new Set(
    (existingTasks || []).map((t) => normalizeTaskTitle(t.title)),
  );

  const taskCandidates: Array<{
    title: string;
    description?: string;
    priority: "high" | "medium" | "low";
    due_date?: string;
  }> = [];

  const suggestions = analysis.suggestions?.items || [];
  for (const suggestion of suggestions) {
    if (suggestion.type !== "action") continue;
    const content = suggestion.content?.trim();
    if (!content) continue;

    const title =
      content.length > 120 ? `${content.slice(0, 117)}...` : content;
    taskCandidates.push({
      title,
      description: suggestion.reasoning
        ? `AI suggestion: ${suggestion.reasoning}`
        : "AI-generated action item from lead analysis.",
      priority: suggestion.priority || "medium",
      due_date: getDueDate(
        suggestion.priority || "medium",
        analysis.suggestions?.suggestedFollowUpDate,
      ),
    });
  }

  const nextAction = analysis.suggestions?.nextBestAction?.trim();
  if (nextAction) {
    const title =
      nextAction.length > 120 ? `${nextAction.slice(0, 117)}...` : nextAction;
    taskCandidates.push({
      title,
      description: "AI-generated next best action from lead analysis.",
      priority: "high",
      due_date: getDueDate("high", analysis.suggestions?.suggestedFollowUpDate),
    });
  }

  if (!taskCandidates.length) return { created: 0 };

  const tasksToInsert = taskCandidates
    .filter((candidate) => {
      const key = normalizeTaskTitle(candidate.title);
      if (existingTitles.has(key)) {
        return false;
      }
      existingTitles.add(key);
      return true;
    })
    .map((candidate) => ({
      title: candidate.title,
      description: candidate.description,
      priority: candidate.priority,
      status: "todo",
      due_date: candidate.due_date,
      lead_id: lead.id,
      assigned_to: lead.assigned_staff,
    }));

  if (!tasksToInsert.length) return { created: 0 };

  const { data, error: insertError } = await supabase
    .from("tasks")
    .insert(tasksToInsert)
    .select("id");

  if (insertError) {
    console.error("Failed to create tasks from AI suggestions:", insertError);
    return { created: 0 };
  }

  return { created: data?.length || 0 };
}

// POST /api/leads/[id]/analyze - Analyze a lead with AI using CloudCore
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    // Fetch current lead to get previous score for comparison
    const currentLeadResult = await services.supabase.getLead(id);
    const previousScore = currentLeadResult.data?.ai_score ?? null;

    // Use CloudCore's lead analyst kernel for full analysis
    const result = await kernels.leadAnalyst.analyze({
      leadId: id,
      analysisType: "full_analysis",
      language,
      options: {
        includeSimilarLeads: false,
        includeHistoricalData: false,
        maxNotesToAnalyze: 10,
      },
    });

    if (!result.success || !result.data) {
      if (result.error?.code === "LEAD_NOT_FOUND") {
        return notFound("Lead not found");
      }
      return error(result.error?.message || "Analysis failed", 500);
    }

    // Map factors to the database format
    const aiFactors = result.data.score?.factors?.map((f) => ({
      factor: f.name,
      impact: f.impact as "positive" | "negative" | "neutral",
    }));

    // Map suggestions to the database format
    const aiSuggestions = result.data.suggestions?.items?.map((s) => ({
      type: s.type,
      content: s.content,
      priority: s.priority as "high" | "medium" | "low",
    }));

    // Update lead with full AI insights (using snake_case for database)
    const updateResult = await services.supabase.updateLeadAI(id, {
      ai_summary: result.data.summary?.text,
      ai_score: result.data.score?.value,
      ai_factors: aiFactors,
      ai_suggestions: aiSuggestions,
      next_action: result.data.suggestions?.nextBestAction,
      follow_up_date: result.data.suggestions?.suggestedFollowUpDate,
      smart_quote_payload: result.data.smartQuotePayload,
    });

    if (!updateResult.success) {
      console.error("Error updating lead:", updateResult.error);
      return error("Failed to update lead with AI insights", 500);
    }

    // Fetch updated lead
    const leadResult = await services.supabase.getLead(id);
    const updatedLead = leadResult.data;

    // Check for score changes and trigger appropriate nudges (non-blocking)
    const newScore = result.data.score?.value ?? null;
    if (updatedLead && newScore !== null) {
      // Check if lead just became "hot" (crossed threshold)
      const wasHot = (previousScore ?? 0) >= HOT_LEAD_THRESHOLD;
      const isHot = newScore >= HOT_LEAD_THRESHOLD;

      if (!wasHot && isHot) {
        // Lead just became hot - trigger hot lead alert
        triggerEventNudge("hot_lead_alert", id, {
          previous_score: previousScore,
          new_score: newScore,
        }).catch((err) => {
          console.error("[Hot Lead Alert] Failed to trigger nudge:", err);
        });
      } else if (previousScore !== null) {
        // Check for significant score changes
        const scoreDiff = newScore - previousScore;

        if (scoreDiff >= SCORE_CHANGE_THRESHOLD) {
          // Score increased significantly
          triggerEventNudge("score_increased", id, {
            previous_score: previousScore,
            new_score: newScore,
          }).catch((err) => {
            console.error("[Score Increased] Failed to trigger nudge:", err);
          });
        } else if (scoreDiff <= -SCORE_CHANGE_THRESHOLD) {
          // Score decreased significantly
          triggerEventNudge("score_decreased", id, {
            previous_score: previousScore,
            new_score: newScore,
          }).catch((err) => {
            console.error("[Score Decreased] Failed to trigger nudge:", err);
          });
        }
      }
    }

    // Create actionable tasks from AI suggestions (non-blocking)
    if (updatedLead) {
      createTasksFromAnalysis(updatedLead, {
        suggestions: {
          items: result.data.suggestions?.items?.map((s) => ({
            type: s.type,
            content: s.content,
            priority: s.priority as "high" | "medium" | "low",
            reasoning: s.reasoning,
          })),
          nextBestAction: result.data.suggestions?.nextBestAction,
          suggestedFollowUpDate: result.data.suggestions?.suggestedFollowUpDate,
        },
      }).catch((taskError) => {
        console.error("Failed to create tasks from AI analysis:", taskError);
      });
    }

    // Send Telegram notification with AI analysis details (non-blocking)
    if (updatedLead) {
      notifyAIAnalysis({
        leadId: id,
        leadName: updatedLead.name,
        phone: updatedLead.contact,
        source: updatedLead.source,
        status: updatedLead.status,
        summary: result.data.summary?.text,
        score: result.data.score?.value,
        nextAction: result.data.suggestions?.nextBestAction,
        followUpDate: result.data.suggestions?.suggestedFollowUpDate,
        factors: result.data.score?.factors.map((f) => ({
          factor: f.name,
          impact: f.impact as "positive" | "negative" | "neutral",
        })),
        suggestions: result.data.suggestions?.items.map((s) => ({
          type: s.type,
          content: s.content,
          priority: s.priority as "high" | "medium" | "low",
        })),
      }).catch((err) => {
        console.error("Failed to send Telegram AI analysis notification:", err);
      });
    }

    return success({
      lead: updatedLead,
      analysis: {
        summary: result.data.summary?.text,
        score: result.data.score?.value,
        nextAction: result.data.suggestions?.nextBestAction,
        followUpDate: result.data.suggestions?.suggestedFollowUpDate,
        factors: result.data.score?.factors.map((f) => ({
          factor: f.name,
          impact: f.impact,
        })),
        suggestions: result.data.suggestions?.items.map((s) => ({
          type: s.type,
          content: s.content,
          priority: s.priority,
        })),
        smartQuotePayload: result.data.smartQuotePayload,
      },
    });
  } catch (err) {
    console.error("Error analyzing lead:", err);
    return error("Internal server error", 500);
  }
}

// GET /api/leads/[id]/analyze - Quick analysis (lightweight)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    // Use CloudCore's quick analyze for lightweight analysis
    const result = await kernels.leadAnalyst.quickAnalyze(id, { language });

    if (!result.success || !result.data) {
      if (result.error?.code === "LEAD_NOT_FOUND") {
        return notFound("Lead not found");
      }
      return error(result.error?.message || "Analysis failed", 500);
    }

    return success(result.data);
  } catch (err) {
    console.error("Error in quick analysis:", err);
    return error("Internal server error", 500);
  }
}
