/**
 * Daily Morning Summary Notification API
 *
 * POST/GET /api/notifications/daily-summary
 *
 * Sends a comprehensive daily briefing via Telegram at 7:30 AM Dubai time (GST/UTC+4)
 * Includes:
 * - Yesterday's activity summary
 * - AI-powered insights
 * - Today's action items with recommendations
 *
 * Cron: 30 3 * * * (3:30 AM UTC = 7:30 AM GST)
 *
 * Related: Issue #37
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for processing

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

// Dubai timezone offset (UTC+4)
const DUBAI_OFFSET_HOURS = 4;

interface DailySummaryStats {
  // Yesterday's activity
  newLeads: number;
  newLeadsBySource: Record<string, number>;
  leadsUpdated: number;
  statusChanges: number;
  notesAdded: number;
  callsProcessed: number;
  callInsightsGenerated: number;
  quotesCreated: number;
  quotesViewed: number;
  quotesConverted: number;
  totalQuoteValue: number;

  // Today's priorities
  hotLeads: Array<{
    id: string;
    name: string;
    reason: string;
    lastContact: string | null;
    budget: number | null;
  }>;
  followUpsDue: Array<{
    id: string;
    name: string;
    dueDate: string;
    context: string | null;
  }>;
  staleLeads: Array<{
    id: string;
    name: string;
    daysSinceActivity: number;
  }>;
  expiringQuotes: Array<{
    id: string;
    leadName: string;
    daysUntilExpiry: number;
  }>;
}

interface AIInsight {
  icon: string;
  text: string;
}

interface AIRecommendation {
  icon: string;
  action: string;
  reason: string;
}

/**
 * Get yesterday's date range in Dubai timezone
 */
function getYesterdayRange(): { start: string; end: string } {
  const now = new Date();
  // Convert to Dubai time
  const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 60 * 60 * 1000);

  // Get yesterday in Dubai time
  const yesterday = new Date(dubaiNow);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  // Convert back to UTC for database queries
  const startUtc = new Date(yesterday.getTime() - DUBAI_OFFSET_HOURS * 60 * 60 * 1000);
  const endUtc = new Date(endOfYesterday.getTime() - DUBAI_OFFSET_HOURS * 60 * 60 * 1000);

  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  };
}

/**
 * Get today's date in Dubai timezone (for follow-ups)
 */
function getTodayDubai(): string {
  const now = new Date();
  const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 60 * 60 * 1000);
  return dubaiNow.toISOString().split("T")[0];
}

/**
 * Format currency in Indian Rupees
 */
function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Calculate days since a date
 */
function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Gather all statistics for the daily summary
 */
async function gatherStats(): Promise<DailySummaryStats> {
  const { start: yesterdayStart, end: yesterdayEnd } = getYesterdayRange();
  const todayDubai = getTodayDubai();

  // Run all queries in parallel for performance
  const [
    newLeadsResult,
    updatedLeadsResult,
    notesResult,
    callsResult,
    quotesResult,
    quotesViewedResult,
    hotLeadsResult,
    followUpsResult,
    staleLeadsResult,
  ] = await Promise.all([
    // New leads created yesterday
    supabaseAdmin
      .from("leads")
      .select("id, source")
      .gte("created_at", yesterdayStart)
      .lte("created_at", yesterdayEnd),

    // Leads updated yesterday (status changes, etc.)
    supabaseAdmin
      .from("leads")
      .select("id, status")
      .gte("updated_at", yesterdayStart)
      .lte("updated_at", yesterdayEnd)
      .neq("created_at", "updated_at"), // Exclude just-created leads

    // Notes added yesterday
    supabaseAdmin
      .from("notes")
      .select("id")
      .gte("created_at", yesterdayStart)
      .lte("created_at", yesterdayEnd),

    // Call recordings processed yesterday
    supabaseAdmin
      .from("call_recordings")
      .select("id, ai_insights")
      .eq("processing_status", "completed")
      .gte("processed_at", yesterdayStart)
      .lte("processed_at", yesterdayEnd),

    // Quotes created yesterday
    supabaseAdmin
      .from("smart_quotes")
      .select("id, lead_id, scores")
      .gte("created_at", yesterdayStart)
      .lte("created_at", yesterdayEnd),

    // Quote events (views) yesterday
    supabaseAdmin
      .from("smart_quote_events")
      .select("smart_quote_id, event_type")
      .in("event_type", ["view", "form_submit"])
      .gte("created_at", yesterdayStart)
      .lte("created_at", yesterdayEnd),

    // Hot leads needing attention
    supabaseAdmin
      .from("leads")
      .select("id, name, status, ai_summary, budget, updated_at")
      .eq("status", "hot")
      .eq("is_archived", false)
      .order("updated_at", { ascending: true })
      .limit(5),

    // Follow-ups due today
    supabaseAdmin
      .from("leads")
      .select("id, name, follow_up_date, next_action")
      .eq("follow_up_date", todayDubai)
      .eq("is_archived", false)
      .in("status", ["new", "follow_up", "hot"])
      .limit(10),

    // Stale leads (no activity in 7+ days)
    supabaseAdmin
      .from("leads")
      .select("id, name, updated_at")
      .in("status", ["new", "follow_up"])
      .eq("is_archived", false)
      .lt("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(5),
  ]);

  // Process new leads by source
  const newLeadsBySource: Record<string, number> = {};
  for (const lead of newLeadsResult.data || []) {
    const source = lead.source || "Unknown";
    newLeadsBySource[source] = (newLeadsBySource[source] || 0) + 1;
  }

  // Process quote events
  const viewedQuoteIds = new Set<string>();
  const convertedQuoteIds = new Set<string>();
  for (const event of quotesViewedResult.data || []) {
    if (event.event_type === "view") viewedQuoteIds.add(event.smart_quote_id);
    if (event.event_type === "form_submit") convertedQuoteIds.add(event.smart_quote_id);
  }

  // Calculate total quote value (from scores.estimated_value if available)
  let totalQuoteValue = 0;
  for (const quote of quotesResult.data || []) {
    const scores = quote.scores as { estimated_value?: number } | null;
    if (scores?.estimated_value) {
      totalQuoteValue += scores.estimated_value;
    }
  }

  // Count call insights
  let callInsightsGenerated = 0;
  for (const call of callsResult.data || []) {
    const insights = call.ai_insights as Record<string, unknown> | null;
    if (insights && Object.keys(insights).length > 0) {
      callInsightsGenerated++;
    }
  }

  return {
    // Yesterday's activity
    newLeads: newLeadsResult.data?.length || 0,
    newLeadsBySource,
    leadsUpdated: updatedLeadsResult.data?.length || 0,
    statusChanges: updatedLeadsResult.data?.length || 0,
    notesAdded: notesResult.data?.length || 0,
    callsProcessed: callsResult.data?.length || 0,
    callInsightsGenerated,
    quotesCreated: quotesResult.data?.length || 0,
    quotesViewed: viewedQuoteIds.size,
    quotesConverted: convertedQuoteIds.size,
    totalQuoteValue,

    // Today's priorities
    hotLeads: (hotLeadsResult.data || []).map((lead) => ({
      id: lead.id,
      name: lead.name,
      reason: lead.ai_summary?.slice(0, 50) || "Hot lead",
      lastContact: lead.updated_at,
      budget: lead.budget,
    })),
    followUpsDue: (followUpsResult.data || []).map((lead) => ({
      id: lead.id,
      name: lead.name,
      dueDate: lead.follow_up_date,
      context: lead.next_action,
    })),
    staleLeads: (staleLeadsResult.data || []).map((lead) => ({
      id: lead.id,
      name: lead.name,
      daysSinceActivity: daysSince(lead.updated_at),
    })),
    expiringQuotes: [], // TODO: Add quote expiry tracking
  };
}

/**
 * Generate AI insights based on the stats
 */
function generateInsights(stats: DailySummaryStats): AIInsight[] {
  const insights: AIInsight[] = [];

  // Hot leads without recent contact
  const hotLeadsOverdue = stats.hotLeads.filter(
    (lead) => daysSince(lead.lastContact) > 2
  );
  if (hotLeadsOverdue.length > 0) {
    insights.push({
      icon: "🔥",
      text: `${hotLeadsOverdue.length} hot lead${hotLeadsOverdue.length > 1 ? "s" : ""} haven't been contacted in 48+ hours`,
    });
  }

  // Source performance
  const topSource = Object.entries(stats.newLeadsBySource).sort(
    (a, b) => b[1] - a[1]
  )[0];
  if (topSource && topSource[1] > 1) {
    insights.push({
      icon: "📊",
      text: `Most leads from ${topSource[0]} (${topSource[1]} yesterday)`,
    });
  }

  // Quote conversion
  if (stats.quotesViewed > 0 && stats.quotesCreated > 0) {
    const viewRate = Math.round((stats.quotesViewed / stats.quotesCreated) * 100);
    insights.push({
      icon: viewRate > 50 ? "📈" : "📉",
      text: `Quote view rate: ${viewRate}% (${stats.quotesViewed}/${stats.quotesCreated})`,
    });
  }

  // Stale leads alert
  if (stats.staleLeads.length > 3) {
    insights.push({
      icon: "⚠️",
      text: `${stats.staleLeads.length} leads with no activity in 7+ days`,
    });
  }

  // Call insights
  if (stats.callInsightsGenerated > 0) {
    insights.push({
      icon: "🎯",
      text: `${stats.callInsightsGenerated} call${stats.callInsightsGenerated > 1 ? "s" : ""} analyzed with AI insights`,
    });
  }

  // If no specific insights, add a general one
  if (insights.length === 0) {
    insights.push({
      icon: "✅",
      text: "All systems running smoothly",
    });
  }

  return insights.slice(0, 4); // Max 4 insights
}

/**
 * Generate AI recommendations
 */
function generateRecommendations(stats: DailySummaryStats): AIRecommendation[] {
  const recommendations: AIRecommendation[] = [];

  // Prioritize hot leads
  if (stats.hotLeads.length > 0) {
    const topHotLead = stats.hotLeads[0];
    recommendations.push({
      icon: "📞",
      action: `Call ${topHotLead.name} first`,
      reason: topHotLead.budget
        ? `Budget: ${formatCurrency(topHotLead.budget)}`
        : "Priority hot lead",
    });
  }

  // Follow-up reminders
  if (stats.followUpsDue.length > 0) {
    recommendations.push({
      icon: "⏰",
      action: `Complete ${stats.followUpsDue.length} follow-up${stats.followUpsDue.length > 1 ? "s" : ""} today`,
      reason: "Scheduled for today",
    });
  }

  // Stale lead recovery
  if (stats.staleLeads.length > 0) {
    recommendations.push({
      icon: "🔄",
      action: `Re-engage ${stats.staleLeads[0].name}`,
      reason: `${stats.staleLeads[0].daysSinceActivity} days without activity`,
    });
  }

  // Quote follow-up if views but no conversion
  if (stats.quotesViewed > stats.quotesConverted && stats.quotesViewed > 0) {
    recommendations.push({
      icon: "💰",
      action: "Follow up on viewed quotes",
      reason: `${stats.quotesViewed - stats.quotesConverted} quote${stats.quotesViewed - stats.quotesConverted > 1 ? "s" : ""} viewed but not converted`,
    });
  }

  return recommendations.slice(0, 3); // Max 3 recommendations
}

/**
 * Format the daily summary message for Telegram
 */
function formatDailySummaryMessage(
  stats: DailySummaryStats,
  insights: AIInsight[],
  recommendations: AIRecommendation[]
): string {
  const now = new Date();
  const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 60 * 60 * 1000);
  const dateStr = formatDate(dubaiNow);

  const lines: string[] = [];

  // Header
  lines.push(`📊 *MAIYURI BRICKS - DAILY BRIEFING*`);
  lines.push(`📅 ${dateStr} | 🕐 7:30 AM GST`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Yesterday's Activity Section
  lines.push(`📈 *YESTERDAY'S ACTIVITY*`);
  lines.push(``);

  // New leads
  lines.push(`🆕 *New Leads:* ${stats.newLeads}`);
  if (Object.keys(stats.newLeadsBySource).length > 0) {
    const sourceList = Object.entries(stats.newLeadsBySource)
      .map(([source, count]) => `${source} (${count})`)
      .join(", ");
    lines.push(`   └ Sources: ${sourceList}`);
  }
  lines.push(``);

  // Updates
  lines.push(`📝 *Updates:* ${stats.leadsUpdated} leads updated`);
  if (stats.notesAdded > 0) {
    lines.push(`   └ Notes added: ${stats.notesAdded}`);
  }
  lines.push(``);

  // Calls
  if (stats.callsProcessed > 0) {
    lines.push(`📞 *Calls:* ${stats.callsProcessed} recordings processed`);
    if (stats.callInsightsGenerated > 0) {
      lines.push(`   └ Insights extracted: ${stats.callInsightsGenerated}`);
    }
    lines.push(``);
  }

  // Quotes
  if (stats.quotesCreated > 0 || stats.quotesViewed > 0) {
    lines.push(
      `💰 *Quotes:* ${stats.quotesCreated} sent${stats.totalQuoteValue > 0 ? ` (${formatCurrency(stats.totalQuoteValue)} total)` : ""}`
    );
    lines.push(`   └ Viewed: ${stats.quotesViewed} | Converted: ${stats.quotesConverted}`);
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // AI Insights Section
  lines.push(`💡 *AI INSIGHTS*`);
  lines.push(``);
  for (const insight of insights) {
    lines.push(`${insight.icon} ${insight.text}`);
  }
  lines.push(``);

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Today's Priorities Section
  lines.push(`📋 *TODAY'S PRIORITIES*`);
  lines.push(``);

  // Hot leads
  if (stats.hotLeads.length > 0) {
    lines.push(`🔥 *HOT LEADS (Immediate Action)*`);
    for (const lead of stats.hotLeads.slice(0, 3)) {
      const lastContactDays = daysSince(lead.lastContact);
      const budgetStr = lead.budget ? ` - Budget: ${formatCurrency(lead.budget)}` : "";
      lines.push(
        `• ${lead.name} - Last contact: ${lastContactDays}d ago${budgetStr}`
      );
    }
    lines.push(``);
  }

  // Follow-ups due
  if (stats.followUpsDue.length > 0) {
    lines.push(`⏰ *FOLLOW-UPS DUE*`);
    for (const lead of stats.followUpsDue.slice(0, 3)) {
      const contextStr = lead.context ? ` - ${lead.context.slice(0, 30)}` : "";
      lines.push(`• ${lead.name}${contextStr}`);
    }
    lines.push(``);
  }

  // Stale leads
  if (stats.staleLeads.length > 0) {
    lines.push(`⚠️ *NEEDS ATTENTION*`);
    for (const lead of stats.staleLeads.slice(0, 3)) {
      lines.push(`• ${lead.name} - No activity in ${lead.daysSinceActivity} days`);
    }
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // AI Recommendations Section
  lines.push(`🤖 *AI RECOMMENDATIONS*`);
  lines.push(``);
  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    lines.push(`${i + 1}. ${rec.icon} *${rec.action}*`);
    lines.push(`   _${rec.reason}_`);
  }
  lines.push(``);

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Footer
  lines.push(`[📊 View Dashboard](${APP_URL}/dashboard)`);
  lines.push(``);
  lines.push(`_Have a productive day!_ 💪`);

  return lines.join("\n");
}

/**
 * GET /api/notifications/daily-summary - Cron trigger
 */
export async function GET(request: NextRequest) {
  return handleDailySummary(request);
}

/**
 * POST /api/notifications/daily-summary - Manual trigger
 */
export async function POST(request: NextRequest) {
  return handleDailySummary(request);
}

async function handleDailySummary(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is required for cron calls
  // Allow manual triggers without secret if coming from POST
  const isManualTrigger = request.method === "POST";
  const requiresAuth = cronSecret && !isManualTrigger;

  if (requiresAuth && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Daily Summary] Starting daily summary generation...");

  try {
    // Step 1: Gather all statistics
    console.log("[Daily Summary] Gathering statistics...");
    const stats = await gatherStats();

    // Step 2: Generate AI insights
    console.log("[Daily Summary] Generating insights...");
    const insights = generateInsights(stats);

    // Step 3: Generate AI recommendations
    console.log("[Daily Summary] Generating recommendations...");
    const recommendations = generateRecommendations(stats);

    // Step 4: Format the message
    const message = formatDailySummaryMessage(stats, insights, recommendations);

    // Step 5: Send to Telegram
    console.log("[Daily Summary] Sending to Telegram...");
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!chatId) {
      console.error("[Daily Summary] TELEGRAM_CHAT_ID not configured");
      return NextResponse.json(
        { error: "Telegram not configured" },
        { status: 500 }
      );
    }

    const result = await sendTelegramMessage(message, chatId);

    if (!result.success) {
      console.error("[Daily Summary] Failed to send:", result.error);
      return NextResponse.json(
        { error: `Failed to send: ${result.error}` },
        { status: 500 }
      );
    }

    // Step 6: Log the summary (optional - for audit trail)
    // Could insert into a daily_summary_log table here

    console.log("[Daily Summary] Completed successfully");

    return NextResponse.json({
      success: true,
      message: "Daily summary sent successfully",
      data: {
        stats: {
          newLeads: stats.newLeads,
          leadsUpdated: stats.leadsUpdated,
          callsProcessed: stats.callsProcessed,
          quotesCreated: stats.quotesCreated,
          hotLeads: stats.hotLeads.length,
          followUpsDue: stats.followUpsDue.length,
        },
        insightsCount: insights.length,
        recommendationsCount: recommendations.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Daily Summary] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Daily summary failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
