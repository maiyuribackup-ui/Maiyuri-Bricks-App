/**
 * AI-Powered Nudge Enhancement Utilities
 *
 * Phase 3: Smart nudge enhancements using Claude AI
 * - Smart action suggestions based on lead context
 * - Optimal contact time prediction using historical patterns
 * - Personalized message generation for higher engagement
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import type { Lead, NudgeDigestLead } from "@maiyuri/shared";

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Smart Action Suggestion - AI-generated action based on lead context
 */
export interface SmartAction {
  action: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
  script?: string; // Optional talk track for the action
}

/**
 * Optimal Contact Time Prediction
 */
export interface OptimalContactTime {
  recommended_time: string; // HH:MM format (IST)
  time_window: string; // e.g., "9:00 AM - 11:00 AM IST"
  confidence: number; // 0-1
  reasoning: string;
  day_preference?: "weekday" | "weekend" | "any";
}

/**
 * Personalized Nudge Message
 */
export interface PersonalizedMessage {
  message: string;
  tone: "urgent" | "friendly" | "professional" | "empathetic";
  call_to_action: string;
  language: "en" | "ta"; // English or Tamil
}

/**
 * AI Enhancement Result for a single lead
 */
export interface NudgeAIEnhancement {
  lead_id: string;
  smart_action: SmartAction | null;
  optimal_time: OptimalContactTime | null;
  personalized_message: PersonalizedMessage | null;
  generated_at: string;
}

/**
 * Complete JSON with Claude
 */
async function completeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1024,
): Promise<T | null> {
  try {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.5,
      system:
        systemPrompt +
        "\n\nIMPORTANT: Respond ONLY with valid JSON. No other text or explanation.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const content = textContent?.type === "text" ? textContent.text : "";

    // Parse JSON
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7, jsonStr.lastIndexOf("```")).trim();
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3, jsonStr.lastIndexOf("```")).trim();
    }

    return JSON.parse(jsonStr) as T;
  } catch (error) {
    console.error("[Nudge AI] Claude completion error:", error);
    return null;
  }
}

/**
 * Generate smart action suggestion for a lead
 */
export async function generateSmartAction(
  lead: Lead,
  context?: {
    days_overdue?: number;
    last_activity?: string;
    notes_summary?: string;
    call_summary?: string;
  },
): Promise<SmartAction | null> {
  const systemPrompt = `You are a sales advisor for a brick manufacturing business (Maiyuri Bricks) in Chennai, Tamil Nadu.
Generate a SINGLE, highly specific next action for this lead based on their context.

Guidelines:
- Be specific and actionable (not generic like "follow up")
- Consider the lead's status, score, and history
- Account for Tamil Nadu business culture
- If overdue, suggest recovery actions
- For hot leads, suggest closing actions
- For cold leads, suggest re-engagement strategies`;

  const userPrompt = `Generate the best next action for this lead:

LEAD:
- Name: ${lead.name}
- Contact: ${lead.contact}
- Status: ${lead.status}
- AI Score: ${lead.ai_score ? Math.round(lead.ai_score * 100) : "N/A"}%
- Lead Type: ${lead.lead_type || "Unknown"}
- Classification: ${lead.classification || "Unknown"}
- Current Next Action: ${lead.next_action || "None set"}
- Follow-up Date: ${lead.follow_up_date || "Not scheduled"}
- AI Summary: ${lead.ai_summary || "No summary available"}

CONTEXT:
${context?.days_overdue ? `- Follow-up overdue by ${context.days_overdue} days` : ""}
${context?.last_activity ? `- Last activity: ${context.last_activity}` : ""}
${context?.notes_summary ? `- Recent notes: ${context.notes_summary}` : ""}
${context?.call_summary ? `- Recent call insight: ${context.call_summary}` : ""}

Respond with JSON:
{
  "action": "Specific action to take",
  "priority": "high|medium|low",
  "reasoning": "Why this action",
  "script": "Optional: What to say when calling"
}`;

  return completeJson<SmartAction>(systemPrompt, userPrompt, 512);
}

/**
 * Predict optimal contact time based on historical patterns
 */
export async function predictOptimalContactTime(
  lead: Lead,
  interactionHistory?: Array<{ time: string; success: boolean }>,
): Promise<OptimalContactTime | null> {
  // Fetch recent call recordings if history not provided
  let historyContext = "";
  if (!interactionHistory) {
    const { data: recordings } = await supabaseAdmin
      .from("call_recordings")
      .select("created_at, ai_insights")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recordings && recordings.length > 0) {
      historyContext = recordings
        .map((r) => {
          const time = new Date(r.created_at);
          const hour = time.getHours();
          const sentiment = r.ai_insights?.sentiment || "neutral";
          return `- ${time.toLocaleDateString()} at ${hour}:00 - Sentiment: ${sentiment}`;
        })
        .join("\n");
    }
  } else {
    historyContext = interactionHistory
      .map((h) => `- ${h.time}: ${h.success ? "Successful" : "No response"}`)
      .join("\n");
  }

  const systemPrompt = `You are a contact timing optimizer for a brick manufacturing business in Chennai.
Predict the best time to contact this lead based on their profile and history.

Consider:
- Business hours in India (9 AM - 6 PM IST)
- Lead type (builders prefer early morning, homeowners prefer evening)
- Historical interaction patterns
- Weekend vs weekday preferences by profession
- Lunch time avoidance (1 PM - 2 PM)`;

  const userPrompt = `Predict optimal contact time for this lead:

LEAD:
- Name: ${lead.name}
- Lead Type: ${lead.lead_type || "Unknown"}
- Classification: ${lead.classification || "direct_customer"}
- Status: ${lead.status}

INTERACTION HISTORY:
${historyContext || "No previous interaction data available"}

Respond with JSON:
{
  "recommended_time": "HH:MM (24-hour format)",
  "time_window": "Human readable window (e.g., '9:00 AM - 11:00 AM IST')",
  "confidence": 0.7,
  "reasoning": "Why this time is recommended",
  "day_preference": "weekday|weekend|any"
}`;

  return completeJson<OptimalContactTime>(systemPrompt, userPrompt, 512);
}

/**
 * Generate personalized nudge message for higher engagement
 */
export async function generatePersonalizedMessage(
  lead: Lead,
  nudgeType: "morning_digest" | "manual" | "event",
  context?: {
    days_overdue?: number;
    rule_matched?: string;
    event_type?: string;
    staff_name?: string;
  },
  language: "en" | "ta" = "en",
): Promise<PersonalizedMessage | null> {
  const languageInstruction =
    language === "ta"
      ? "\n\nIMPORTANT: Generate the message in Tamil (தமிழ்). Use conversational Chennai Tamil, not formal."
      : "";

  const systemPrompt = `You are crafting a personalized nudge message for a sales team member about a lead.
The message should be concise, actionable, and motivating.

Guidelines:
- Keep message under 100 words
- Include specific lead details that matter
- Match tone to urgency level
- End with a clear call to action
- Be encouraging, not pressuring${languageInstruction}`;

  const userPrompt = `Generate a personalized nudge message:

LEAD:
- Name: ${lead.name}
- Phone: ${lead.contact}
- Status: ${lead.status}
- Score: ${lead.ai_score ? Math.round(lead.ai_score * 100) : "N/A"}%
- Next Action: ${lead.next_action || "Not specified"}

NUDGE CONTEXT:
- Type: ${nudgeType}
${context?.days_overdue ? `- Follow-up overdue by ${context.days_overdue} days` : ""}
${context?.rule_matched ? `- Rule: ${context.rule_matched}` : ""}
${context?.event_type ? `- Event: ${context.event_type}` : ""}
${context?.staff_name ? `- For: ${context.staff_name}` : ""}

Respond with JSON:
{
  "message": "The personalized message",
  "tone": "urgent|friendly|professional|empathetic",
  "call_to_action": "Clear next step",
  "language": "${language}"
}`;

  return completeJson<PersonalizedMessage>(systemPrompt, userPrompt, 512);
}

/**
 * Batch enhance multiple leads with AI (for digest)
 * Uses parallel processing for efficiency
 */
export async function batchEnhanceLeads(
  leads: NudgeDigestLead[],
  options?: {
    includeSmartActions?: boolean;
    includeOptimalTimes?: boolean;
    includePersonalizedMessages?: boolean;
    language?: "en" | "ta";
  },
): Promise<Map<string, NudgeAIEnhancement>> {
  const results = new Map<string, NudgeAIEnhancement>();
  const {
    includeSmartActions = true,
    includeOptimalTimes = false,
    includePersonalizedMessages = true,
    language = "en",
  } = options || {};

  // Limit batch size to avoid overwhelming the API
  const maxBatch = 5;
  const batchLeads = leads.slice(0, maxBatch);

  // Fetch full lead data for AI processing
  const leadIds = batchLeads.map((l) => l.id);
  const { data: fullLeads } = await supabaseAdmin
    .from("leads")
    .select("*")
    .in("id", leadIds);

  if (!fullLeads) return results;

  // Process in parallel
  const promises = fullLeads.map(async (lead) => {
    const digestLead = batchLeads.find((l) => l.id === lead.id);
    const enhancement: NudgeAIEnhancement = {
      lead_id: lead.id,
      smart_action: null,
      optimal_time: null,
      personalized_message: null,
      generated_at: new Date().toISOString(),
    };

    const tasks: Promise<void>[] = [];

    if (includeSmartActions) {
      tasks.push(
        generateSmartAction(lead, {
          days_overdue: digestLead?.days_overdue,
          last_activity: digestLead?.last_activity,
        }).then((result) => {
          enhancement.smart_action = result;
        }),
      );
    }

    if (includeOptimalTimes) {
      tasks.push(
        predictOptimalContactTime(lead).then((result) => {
          enhancement.optimal_time = result;
        }),
      );
    }

    if (includePersonalizedMessages) {
      tasks.push(
        generatePersonalizedMessage(
          lead,
          "morning_digest",
          {
            days_overdue: digestLead?.days_overdue,
            rule_matched: digestLead?.rule_matched,
          },
          language,
        ).then((result) => {
          enhancement.personalized_message = result;
        }),
      );
    }

    await Promise.all(tasks);
    return { id: lead.id, enhancement };
  });

  const enhancementResults = await Promise.all(promises);
  for (const { id, enhancement } of enhancementResults) {
    results.set(id, enhancement);
  }

  return results;
}

/**
 * Format AI-enhanced digest entry
 */
export function formatEnhancedDigestEntry(
  lead: NudgeDigestLead,
  enhancement?: NudgeAIEnhancement,
): string {
  const STATUS_EMOJI: Record<string, string> = {
    new: "🆕",
    follow_up: "⏰",
    hot: "🔥",
    cold: "❄️",
    converted: "✅",
    lost: "❌",
  };

  const emoji = STATUS_EMOJI[lead.status] || "📌";
  const lines: string[] = [];

  // Header
  lines.push(`${emoji} *${lead.status.toUpperCase()}:* ${lead.name}`);
  lines.push(`   📱 ${lead.contact}`);

  // Overdue info
  if (lead.days_overdue) {
    lines.push(
      `   📅 Follow-up overdue by ${lead.days_overdue} day${lead.days_overdue > 1 ? "s" : ""}`,
    );
  }

  // Score
  if (lead.ai_score !== null && lead.ai_score !== undefined) {
    const scoreEmoji =
      lead.ai_score >= 0.7 ? "🔥" : lead.ai_score >= 0.4 ? "🟡" : "⚪";
    lines.push(`   ${scoreEmoji} Score: ${Math.round(lead.ai_score * 100)}%`);
  }

  // AI Enhancement: Smart Action (replaces generic next_action)
  if (enhancement?.smart_action) {
    const priorityEmoji =
      enhancement.smart_action.priority === "high"
        ? "🎯"
        : enhancement.smart_action.priority === "medium"
          ? "💡"
          : "📝";
    lines.push(
      `   ${priorityEmoji} *Action:* ${enhancement.smart_action.action}`,
    );
    if (enhancement.smart_action.script) {
      lines.push(
        `   💬 _"${enhancement.smart_action.script.slice(0, 60)}..."_`,
      );
    }
  } else if (lead.next_action) {
    lines.push(
      `   💡 ${lead.next_action.slice(0, 50)}${lead.next_action.length > 50 ? "..." : ""}`,
    );
  }

  // AI Enhancement: Optimal Contact Time
  if (enhancement?.optimal_time) {
    lines.push(`   ⏰ Best time: ${enhancement.optimal_time.time_window}`);
  }

  return lines.join("\n");
}

export default {
  generateSmartAction,
  predictOptimalContactTime,
  generatePersonalizedMessage,
  batchEnhanceLeads,
  formatEnhancedDigestEntry,
};
