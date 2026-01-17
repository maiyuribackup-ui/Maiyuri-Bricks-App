import { NextRequest } from "next/server";
import { kernels, services } from "@maiyuri/api";
import { success, error, notFound } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/supabase-server";
import { notifyAIAnalysis } from "@/lib/telegram";
import type { Lead } from "@maiyuri/shared";

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
