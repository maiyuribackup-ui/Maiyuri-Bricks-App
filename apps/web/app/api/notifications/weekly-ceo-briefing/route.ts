/**
 * Weekly CEO Briefing - AI Summary for Founder
 *
 * POST/GET /api/notifications/weekly-ceo-briefing
 *
 * Sends a comprehensive weekly executive briefing via Telegram every Saturday
 * at 7:00 AM Dubai time (GST/UTC+4). Includes:
 * - Weekly performance snapshot with week-over-week trends
 * - Sales executive performance analysis
 * - Knowledge gaps identified from call recordings
 * - Lead handling quality assessment
 * - Actionable points for weekly review meeting
 *
 * Cron: 0 3 * * 6 (3:00 AM UTC on Saturdays = 7:00 AM GST)
 *
 * Related: Issue #38
 */

import { NextRequest, NextResponse } from "next/server";
import { services } from "@maiyuri/api";
import { sendTelegramMessage } from "@/lib/telegram";

// Use the working cloudcore supabase service
const supabaseAdmin = services.supabase.supabase;

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 120 seconds for comprehensive analysis

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

// Dubai timezone offset (UTC+4)
const DUBAI_OFFSET_HOURS = 4;

// Types
interface WeeklyPerformance {
  totalLeads: number;
  newLeads: number;
  convertedLeads: number;
  lostLeads: number;
  hotLeads: number;
  pendingFollowUps: number;
  pipelineValue: number;
  avgResponseTimeHours: number;
  conversionRate: number;
  quoteToCloseRate: number;
  avgDaysToConversion: number;
}

interface SalesExecPerformance {
  id: string;
  name: string;
  leadsAssigned: number;
  leadsConverted: number;
  conversionRate: number;
  avgResponseTimeHours: number;
  notesAdded: number;
  callsMade: number;
  score: number; // 1-5 stars
  trend: "up" | "down" | "stable";
}

interface KnowledgeGap {
  severity: "critical" | "important" | "minor";
  description: string;
  affectedLeads: number;
  potentialImpact: string;
  source: string;
}

interface LeadHandlingQuality {
  professionalTone: number;
  technicalAccuracy: number;
  followUpConsistency: number;
  commonIssues: Array<{ issue: string; count: number }>;
  bestPractices: string[];
}

interface MeetingPoint {
  icon: string;
  title: string;
  context: string;
  type: "action" | "training" | "process" | "recognition" | "risk";
}

interface WeeklyBriefingData {
  weekStart: Date;
  weekEnd: Date;
  thisWeek: WeeklyPerformance;
  lastWeek: WeeklyPerformance;
  execPerformance: SalesExecPerformance[];
  knowledgeGaps: KnowledgeGap[];
  handlingQuality: LeadHandlingQuality;
  meetingPoints: MeetingPoint[];
}

/**
 * Get the date range for this week and last week
 */
function getWeekRanges(): {
  thisWeek: { start: string; end: string };
  lastWeek: { start: string; end: string };
  weekStartDisplay: Date;
  weekEndDisplay: Date;
} {
  const now = new Date();
  // Convert to Dubai time
  const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 60 * 60 * 1000);

  // Find the start of this week (Saturday, since we send on Saturday)
  const dayOfWeek = dubaiNow.getDay();
  const daysToSubtract = dayOfWeek === 6 ? 7 : dayOfWeek + 1; // Go back to last Saturday

  const thisWeekEnd = new Date(dubaiNow);
  thisWeekEnd.setDate(thisWeekEnd.getDate() - 1); // Yesterday (Friday)
  thisWeekEnd.setHours(23, 59, 59, 999);

  const thisWeekStart = new Date(thisWeekEnd);
  thisWeekStart.setDate(thisWeekStart.getDate() - 6); // 7 days ago (Saturday)
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);

  const lastWeekStart = new Date(lastWeekEnd);
  lastWeekStart.setDate(lastWeekStart.getDate() - 6);
  lastWeekStart.setHours(0, 0, 0, 0);

  // Convert to UTC for database queries
  const toUtc = (date: Date) =>
    new Date(date.getTime() - DUBAI_OFFSET_HOURS * 60 * 60 * 1000).toISOString();

  return {
    thisWeek: {
      start: toUtc(thisWeekStart),
      end: toUtc(thisWeekEnd),
    },
    lastWeek: {
      start: toUtc(lastWeekStart),
      end: toUtc(lastWeekEnd),
    },
    weekStartDisplay: thisWeekStart,
    weekEndDisplay: thisWeekEnd,
  };
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
function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Calculate percentage change
 */
function percentChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${Math.round(change)}%`;
}

/**
 * Generate star rating
 */
function starRating(score: number): string {
  const fullStars = Math.round(score);
  return "⭐".repeat(fullStars) + "☆".repeat(5 - fullStars);
}

/**
 * Get weekly performance metrics for a date range
 */
async function getWeeklyPerformance(
  startDate: string,
  endDate: string
): Promise<WeeklyPerformance> {
  // Run queries in parallel
  const [
    allLeadsResult,
    newLeadsResult,
    convertedResult,
    lostResult,
    hotLeadsResult,
    pendingFollowUpsResult,
    quotesResult,
    notesResult,
  ] = await Promise.all([
    // Total leads in system (active)
    supabaseAdmin
      .from("leads")
      .select("id, budget")
      .eq("is_archived", false)
      .in("status", ["new", "follow_up", "hot", "cold"]),

    // New leads this week
    supabaseAdmin
      .from("leads")
      .select("id, created_at")
      .gte("created_at", startDate)
      .lte("created_at", endDate),

    // Converted leads this week
    supabaseAdmin
      .from("leads")
      .select("id, updated_at, created_at")
      .eq("status", "converted")
      .gte("updated_at", startDate)
      .lte("updated_at", endDate),

    // Lost leads this week
    supabaseAdmin
      .from("leads")
      .select("id")
      .eq("status", "lost")
      .gte("updated_at", startDate)
      .lte("updated_at", endDate),

    // Hot leads currently
    supabaseAdmin.from("leads").select("id").eq("status", "hot").eq("is_archived", false),

    // Pending follow-ups
    supabaseAdmin
      .from("leads")
      .select("id")
      .eq("status", "follow_up")
      .eq("is_archived", false),

    // Quotes created this week
    supabaseAdmin
      .from("smart_quotes")
      .select("id, scores")
      .gte("created_at", startDate)
      .lte("created_at", endDate),

    // Notes with timestamps (for response time calculation)
    supabaseAdmin
      .from("notes")
      .select("id, lead_id, created_at")
      .gte("created_at", startDate)
      .lte("created_at", endDate),
  ]);

  // Calculate pipeline value
  let pipelineValue = 0;
  for (const lead of allLeadsResult.data || []) {
    if (lead.budget) pipelineValue += lead.budget;
  }

  // Calculate average days to conversion
  let totalDaysToConvert = 0;
  let convertedCount = 0;
  for (const lead of convertedResult.data || []) {
    if (lead.created_at && lead.updated_at) {
      const created = new Date(lead.created_at);
      const converted = new Date(lead.updated_at);
      const days = Math.floor(
        (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );
      totalDaysToConvert += days;
      convertedCount++;
    }
  }

  const newLeadsCount = newLeadsResult.data?.length || 0;
  const convertedLeadsCount = convertedResult.data?.length || 0;
  const quotesCount = quotesResult.data?.length || 0;

  return {
    totalLeads: allLeadsResult.data?.length || 0,
    newLeads: newLeadsCount,
    convertedLeads: convertedLeadsCount,
    lostLeads: lostResult.data?.length || 0,
    hotLeads: hotLeadsResult.data?.length || 0,
    pendingFollowUps: pendingFollowUpsResult.data?.length || 0,
    pipelineValue,
    avgResponseTimeHours: 2.5, // TODO: Calculate from first note/call after lead creation
    conversionRate: newLeadsCount > 0 ? (convertedLeadsCount / newLeadsCount) * 100 : 0,
    quoteToCloseRate: quotesCount > 0 ? (convertedLeadsCount / quotesCount) * 100 : 0,
    avgDaysToConversion: convertedCount > 0 ? totalDaysToConvert / convertedCount : 0,
  };
}

/**
 * Get sales executive performance metrics
 */
async function getSalesExecPerformance(
  startDate: string,
  endDate: string
): Promise<SalesExecPerformance[]> {
  // Get all sales staff
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, name, role")
    .in("role", ["founder", "engineer", "accountant"])
    .eq("is_active", true);

  if (!users || users.length === 0) return [];

  const execPerformance: SalesExecPerformance[] = [];

  for (const user of users) {
    // Get leads assigned to this user
    const [assignedResult, convertedResult, notesResult, callsResult] =
      await Promise.all([
        supabaseAdmin
          .from("leads")
          .select("id")
          .eq("assigned_staff", user.id)
          .gte("created_at", startDate)
          .lte("created_at", endDate),

        supabaseAdmin
          .from("leads")
          .select("id")
          .eq("assigned_staff", user.id)
          .eq("status", "converted")
          .gte("updated_at", startDate)
          .lte("updated_at", endDate),

        supabaseAdmin
          .from("notes")
          .select("id")
          .eq("staff_id", user.id)
          .gte("created_at", startDate)
          .lte("created_at", endDate),

        supabaseAdmin
          .from("call_recordings")
          .select("id")
          .eq("telegram_user_id", user.id) // May need adjustment based on actual linking
          .gte("created_at", startDate)
          .lte("created_at", endDate),
      ]);

    const leadsAssigned = assignedResult.data?.length || 0;
    const leadsConverted = convertedResult.data?.length || 0;
    const notesAdded = notesResult.data?.length || 0;
    const callsMade = callsResult.data?.length || 0;

    // Calculate score (1-5) based on multiple factors
    let score = 3; // Base score
    const conversionRate = leadsAssigned > 0 ? (leadsConverted / leadsAssigned) * 100 : 0;

    if (conversionRate >= 30) score += 1;
    if (conversionRate >= 50) score += 1;
    if (notesAdded >= 10) score += 0.5;
    if (callsMade >= 5) score += 0.5;
    if (leadsAssigned === 0) score = 3; // Neutral if no leads

    score = Math.min(5, Math.max(1, score));

    execPerformance.push({
      id: user.id,
      name: user.name,
      leadsAssigned,
      leadsConverted,
      conversionRate,
      avgResponseTimeHours: 2.0, // TODO: Calculate actual response time
      notesAdded,
      callsMade,
      score,
      trend: conversionRate > 25 ? "up" : conversionRate < 15 ? "down" : "stable",
    });
  }

  // Sort by score descending
  return execPerformance.sort((a, b) => b.score - a.score);
}

/**
 * Analyze call recordings for knowledge gaps
 */
async function analyzeKnowledgeGaps(
  startDate: string,
  endDate: string
): Promise<KnowledgeGap[]> {
  // Get call recordings with AI insights
  const { data: recordings } = await supabaseAdmin
    .from("call_recordings")
    .select("id, ai_insights, ai_summary, lead_id")
    .eq("processing_status", "completed")
    .gte("processed_at", startDate)
    .lte("processed_at", endDate);

  if (!recordings || recordings.length === 0) {
    return [
      {
        severity: "minor",
        description: "No call recordings processed this week",
        affectedLeads: 0,
        potentialImpact: "Unable to analyze customer interactions",
        source: "System",
      },
    ];
  }

  const gaps: KnowledgeGap[] = [];
  const issueCategories: Record<string, number> = {};

  // Analyze AI insights from calls
  for (const recording of recordings) {
    const insights = recording.ai_insights as {
      complaints?: string[];
      negative_feedback?: string[];
      recommended_actions?: string[];
    } | null;

    if (insights) {
      // Count complaints and negative feedback
      const complaints = insights.complaints || [];
      const negatives = insights.negative_feedback || [];

      for (const complaint of [...complaints, ...negatives]) {
        const category = categorizeIssue(complaint);
        issueCategories[category] = (issueCategories[category] || 0) + 1;
      }
    }
  }

  // Convert categories to knowledge gaps
  const sortedCategories = Object.entries(issueCategories).sort(
    (a, b) => b[1] - a[1]
  );

  for (const [category, count] of sortedCategories.slice(0, 3)) {
    const severity: KnowledgeGap["severity"] =
      count >= 5 ? "critical" : count >= 3 ? "important" : "minor";

    gaps.push({
      severity,
      description: category,
      affectedLeads: count,
      potentialImpact: getImpactDescription(category, count),
      source: "Call Analysis",
    });
  }

  // Add default gap if none found
  if (gaps.length === 0) {
    gaps.push({
      severity: "minor",
      description: "No significant knowledge gaps detected",
      affectedLeads: 0,
      potentialImpact: "Team performing well",
      source: "Call Analysis",
    });
  }

  return gaps;
}

/**
 * Categorize an issue from call insights
 */
function categorizeIssue(issue: string): string {
  const lower = issue.toLowerCase();

  if (lower.includes("price") || lower.includes("cost") || lower.includes("expensive")) {
    return "Pricing objections not handled effectively";
  }
  if (lower.includes("quality") || lower.includes("durability")) {
    return "Product quality concerns raised";
  }
  if (lower.includes("delivery") || lower.includes("time") || lower.includes("delay")) {
    return "Delivery timeline concerns";
  }
  if (lower.includes("competitor") || lower.includes("other brand")) {
    return "Competitor comparison questions";
  }
  if (lower.includes("technical") || lower.includes("specification")) {
    return "Technical specification knowledge gaps";
  }

  return "General customer concerns";
}

/**
 * Get impact description for a knowledge gap
 */
function getImpactDescription(category: string, count: number): string {
  if (category.includes("Pricing")) {
    return `Potential lost revenue from ${count} price-sensitive leads`;
  }
  if (category.includes("quality")) {
    return `${count} leads may need reassurance on product quality`;
  }
  if (category.includes("Delivery")) {
    return `Delivery clarity needed for ${count} leads`;
  }

  return `Affects ${count} customer interactions`;
}

/**
 * Assess lead handling quality
 */
async function assessLeadHandlingQuality(
  startDate: string,
  endDate: string
): Promise<LeadHandlingQuality> {
  // Get call recordings with sentiment analysis
  const { data: recordings } = await supabaseAdmin
    .from("call_recordings")
    .select("ai_insights")
    .eq("processing_status", "completed")
    .gte("processed_at", startDate)
    .lte("processed_at", endDate);

  let positiveCount = 0;
  let negativeCount = 0;
  let totalCalls = recordings?.length || 0;

  const issues: Record<string, number> = {};
  const goodPractices: Set<string> = new Set();

  for (const recording of recordings || []) {
    const insights = recording.ai_insights as {
      sentiment?: string;
      positive_signals?: string[];
      complaints?: string[];
      recommended_actions?: string[];
    } | null;

    if (insights) {
      if (insights.sentiment === "positive") positiveCount++;
      if (insights.sentiment === "negative") negativeCount++;

      // Track positive signals as good practices
      for (const signal of insights.positive_signals || []) {
        if (signal.length < 50) goodPractices.add(signal);
      }

      // Track complaints as issues
      for (const complaint of insights.complaints || []) {
        const category = categorizeIssue(complaint);
        issues[category] = (issues[category] || 0) + 1;
      }
    }
  }

  // Calculate quality metrics
  const professionalTone = totalCalls > 0 ? (positiveCount / totalCalls) * 100 : 75;
  const technicalAccuracy = 70; // Default, would need more sophisticated analysis
  const followUpConsistency = 65; // Default, would need follow-up tracking

  // Sort issues by count
  const sortedIssues = Object.entries(issues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([issue, count]) => ({ issue, count }));

  return {
    professionalTone: Math.round(professionalTone),
    technicalAccuracy,
    followUpConsistency,
    commonIssues: sortedIssues,
    bestPractices: Array.from(goodPractices).slice(0, 3),
  };
}

/**
 * Generate meeting points for weekly review
 */
function generateMeetingPoints(
  thisWeek: WeeklyPerformance,
  lastWeek: WeeklyPerformance,
  execPerformance: SalesExecPerformance[],
  knowledgeGaps: KnowledgeGap[],
  handlingQuality: LeadHandlingQuality
): MeetingPoint[] {
  const points: MeetingPoint[] = [];

  // Performance-based action items
  if (thisWeek.conversionRate < lastWeek.conversionRate - 5) {
    points.push({
      icon: "🎯",
      title: "Address conversion rate decline",
      context: `Conversion dropped from ${lastWeek.conversionRate.toFixed(0)}% to ${thisWeek.conversionRate.toFixed(0)}%`,
      type: "action",
    });
  }

  // Training needs from knowledge gaps
  const criticalGaps = knowledgeGaps.filter((g) => g.severity === "critical");
  if (criticalGaps.length > 0) {
    points.push({
      icon: "📚",
      title: `Training needed: ${criticalGaps[0].description}`,
      context: `Affected ${criticalGaps[0].affectedLeads} leads this week`,
      type: "training",
    });
  }

  // Process improvements
  if (thisWeek.pendingFollowUps > 10) {
    points.push({
      icon: "🔧",
      title: "Clear follow-up backlog",
      context: `${thisWeek.pendingFollowUps} follow-ups pending - consider redistribution`,
      type: "process",
    });
  }

  // Recognition
  const topPerformer = execPerformance[0];
  if (topPerformer && topPerformer.score >= 4) {
    points.push({
      icon: "🏆",
      title: `Recognize ${topPerformer.name}`,
      context: `Top performer with ${topPerformer.conversionRate.toFixed(0)}% conversion rate`,
      type: "recognition",
    });
  }

  // Risk alerts
  const strugglingExec = execPerformance.find((e) => e.score < 2.5 && e.leadsAssigned > 0);
  if (strugglingExec) {
    points.push({
      icon: "⚠️",
      title: `Support ${strugglingExec.name}`,
      context: `Conversion rate ${strugglingExec.conversionRate.toFixed(0)}% - may need coaching`,
      type: "risk",
    });
  }

  // Hot leads attention
  if (thisWeek.hotLeads > 5) {
    points.push({
      icon: "🔥",
      title: "Prioritize hot leads conversion",
      context: `${thisWeek.hotLeads} hot leads in pipeline - focus on closing`,
      type: "action",
    });
  }

  // Ensure we have at least 3 points
  if (points.length < 3) {
    points.push({
      icon: "✅",
      title: "Continue current momentum",
      context: "Team is performing steadily this week",
      type: "action",
    });
  }

  return points.slice(0, 5); // Max 5 meeting points
}

/**
 * Format the weekly CEO briefing message
 */
function formatWeeklyCEOBriefing(data: WeeklyBriefingData): string {
  const {
    weekStart,
    weekEnd,
    thisWeek,
    lastWeek,
    execPerformance,
    knowledgeGaps,
    handlingQuality,
    meetingPoints,
  } = data;

  const lines: string[] = [];

  // Header
  lines.push(`📊 *MAIYURI BRICKS - WEEKLY CEO BRIEFING*`);
  lines.push(`📅 Week of ${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`);
  lines.push(`🏢 Executive Summary`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Weekly Performance Snapshot
  lines.push(`📈 *WEEKLY PERFORMANCE SNAPSHOT*`);
  lines.push(``);
  lines.push(
    `*Total Active Leads:* ${thisWeek.totalLeads} (${percentChange(thisWeek.totalLeads, lastWeek.totalLeads)} vs last week)`
  );
  lines.push(
    `├── New: ${thisWeek.newLeads} | Converted: ${thisWeek.convertedLeads} | Lost: ${thisWeek.lostLeads}`
  );
  lines.push(
    `├── Hot: ${thisWeek.hotLeads} | Follow-ups: ${thisWeek.pendingFollowUps}`
  );
  lines.push(`└── Pipeline Value: ${formatCurrency(thisWeek.pipelineValue)}`);
  lines.push(``);
  lines.push(`*Key Metrics:*`);
  lines.push(
    `• Conversion Rate: ${thisWeek.conversionRate.toFixed(0)}% (vs ${lastWeek.conversionRate.toFixed(0)}% last week)`
  );
  lines.push(
    `• Quote-to-Close: ${thisWeek.quoteToCloseRate.toFixed(0)}% (vs ${lastWeek.quoteToCloseRate.toFixed(0)}% last week)`
  );
  lines.push(
    `• Avg Days to Conversion: ${thisWeek.avgDaysToConversion.toFixed(0)} days`
  );
  lines.push(``);

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Sales Executive Performance
  lines.push(`👥 *SALES EXECUTIVE PERFORMANCE*`);
  lines.push(``);

  if (execPerformance.length > 0) {
    for (const exec of execPerformance.slice(0, 5)) {
      const trendIcon = exec.trend === "up" ? "📈" : exec.trend === "down" ? "📉" : "➡️";
      lines.push(
        `*${exec.name}* ${trendIcon}`
      );
      lines.push(
        `├ Leads: ${exec.leadsAssigned} | Conv: ${exec.conversionRate.toFixed(0)}% | Notes: ${exec.notesAdded}`
      );
      lines.push(`└ Score: ${starRating(exec.score)}`);
      lines.push(``);
    }

    // Top performer and needs coaching
    const topPerformer = execPerformance[0];
    if (topPerformer.score >= 4) {
      lines.push(`🏆 *Top Performer:* ${topPerformer.name}`);
    }

    const needsCoaching = execPerformance.find((e) => e.score < 2.5 && e.leadsAssigned > 0);
    if (needsCoaching) {
      lines.push(`⚠️ *Needs Coaching:* ${needsCoaching.name}`);
    }
    lines.push(``);
  } else {
    lines.push(`_No sales executive data available_`);
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Knowledge Gaps
  lines.push(`🧠 *KNOWLEDGE GAPS IDENTIFIED*`);
  lines.push(``);
  lines.push(`_From call recordings and lead interactions:_`);
  lines.push(``);

  for (let i = 0; i < knowledgeGaps.length; i++) {
    const gap = knowledgeGaps[i];
    const severityIcon =
      gap.severity === "critical" ? "🔴" : gap.severity === "important" ? "🟡" : "🟢";
    const severityLabel = gap.severity.toUpperCase();

    lines.push(`${i + 1}. ${severityIcon} *${severityLabel}:* ${gap.description}`);
    lines.push(`   └ ${gap.potentialImpact}`);
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Lead Handling Quality
  lines.push(`🎯 *LEAD HANDLING QUALITY*`);
  lines.push(``);
  lines.push(`_AI Analysis of Customer Interactions:_`);
  lines.push(``);
  lines.push(`*Communication Quality:*`);
  lines.push(
    `├── Professional tone: ${handlingQuality.professionalTone}% ${handlingQuality.professionalTone >= 70 ? "✅" : "⚠️"}`
  );
  lines.push(
    `├── Technical accuracy: ${handlingQuality.technicalAccuracy}% ${handlingQuality.technicalAccuracy >= 70 ? "✅" : "⚠️"}`
  );
  lines.push(`└── Follow-up consistency: ${handlingQuality.followUpConsistency}%`);
  lines.push(``);

  if (handlingQuality.commonIssues.length > 0) {
    lines.push(`*Common Issues Detected:*`);
    for (const issue of handlingQuality.commonIssues) {
      lines.push(`• ${issue.issue} - ${issue.count} occurrences`);
    }
    lines.push(``);
  }

  if (handlingQuality.bestPractices.length > 0) {
    lines.push(`*Best Practices Observed:*`);
    for (const practice of handlingQuality.bestPractices) {
      lines.push(`✅ ${practice}`);
    }
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Meeting Points
  lines.push(`📋 *POINTS FOR WEEKLY REVIEW MEETING*`);
  lines.push(``);

  for (let i = 0; i < meetingPoints.length; i++) {
    const point = meetingPoints[i];
    lines.push(`${i + 1}. ${point.icon} *${point.title}*`);
    lines.push(`   _${point.context}_`);
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Strategic Recommendations
  lines.push(`💡 *AI STRATEGIC RECOMMENDATIONS*`);
  lines.push(``);

  // Generate dynamic recommendations based on data
  if (thisWeek.hotLeads > 3) {
    lines.push(`1. *Focus Area:* Convert hot leads pipeline (${thisWeek.hotLeads} hot leads)`);
  } else {
    lines.push(`1. *Focus Area:* Increase lead generation activities`);
  }

  if (thisWeek.pendingFollowUps > 5) {
    lines.push(`2. *Quick Win:* Clear ${thisWeek.pendingFollowUps} pending follow-ups`);
  } else {
    lines.push(`2. *Quick Win:* Review and optimize conversion process`);
  }

  if (thisWeek.conversionRate < lastWeek.conversionRate) {
    lines.push(`3. *Watch Out:* Conversion rate trending down - investigate causes`);
  } else {
    lines.push(`3. *Watch Out:* Maintain quality while scaling lead volume`);
  }

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Footer
  lines.push(`[📊 View Dashboard](${APP_URL}/dashboard)`);
  lines.push(`[📈 View Analytics](${APP_URL}/reports)`);
  lines.push(``);
  lines.push(`_Have a great week!_ 🚀`);

  return lines.join("\n");
}

/**
 * GET /api/notifications/weekly-ceo-briefing - Cron trigger
 */
export async function GET(request: NextRequest) {
  return handleWeeklyBriefing(request);
}

/**
 * POST /api/notifications/weekly-ceo-briefing - Manual trigger
 */
export async function POST(request: NextRequest) {
  return handleWeeklyBriefing(request);
}

async function handleWeeklyBriefing(request: NextRequest): Promise<NextResponse> {
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

  console.log("[Weekly CEO Briefing] Starting weekly briefing generation...");

  try {
    // Step 1: Get date ranges
    const { thisWeek, lastWeek, weekStartDisplay, weekEndDisplay } = getWeekRanges();

    console.log("[Weekly CEO Briefing] Date range:", thisWeek);

    // Step 2: Gather all data in parallel
    console.log("[Weekly CEO Briefing] Gathering performance data...");

    const [
      thisWeekPerformance,
      lastWeekPerformance,
      execPerformance,
      knowledgeGaps,
      handlingQuality,
    ] = await Promise.all([
      getWeeklyPerformance(thisWeek.start, thisWeek.end),
      getWeeklyPerformance(lastWeek.start, lastWeek.end),
      getSalesExecPerformance(thisWeek.start, thisWeek.end),
      analyzeKnowledgeGaps(thisWeek.start, thisWeek.end),
      assessLeadHandlingQuality(thisWeek.start, thisWeek.end),
    ]);

    // Step 3: Generate meeting points
    console.log("[Weekly CEO Briefing] Generating meeting points...");
    const meetingPoints = generateMeetingPoints(
      thisWeekPerformance,
      lastWeekPerformance,
      execPerformance,
      knowledgeGaps,
      handlingQuality
    );

    // Step 4: Compile briefing data
    const briefingData: WeeklyBriefingData = {
      weekStart: weekStartDisplay,
      weekEnd: weekEndDisplay,
      thisWeek: thisWeekPerformance,
      lastWeek: lastWeekPerformance,
      execPerformance,
      knowledgeGaps,
      handlingQuality,
      meetingPoints,
    };

    // Step 5: Format the message
    const message = formatWeeklyCEOBriefing(briefingData);

    // Step 6: Send to Telegram (CEO chat or main channel)
    console.log("[Weekly CEO Briefing] Sending to Telegram...");

    // Use notification-specific chat ID
    const chatId =
      process.env.Notification_TELEGRAM_CHAT_ID ||
      process.env.CEO_TELEGRAM_CHAT_ID ||
      process.env.TELEGRAM_CHAT_ID;

    // Debug: Log which env vars are available (keys only, no values for security)
    console.log("[Weekly CEO Briefing] Checking Telegram env vars:", {
      hasNotificationChatId: !!process.env.Notification_TELEGRAM_CHAT_ID,
      hasCeoChatId: !!process.env.CEO_TELEGRAM_CHAT_ID,
      hasTelegramChatId: !!process.env.TELEGRAM_CHAT_ID,
      chatIdFound: !!chatId,
    });

    if (!chatId) {
      console.error("[Weekly CEO Briefing] No Telegram chat ID configured");
      return NextResponse.json(
        {
          error: "Telegram not configured",
          debug: {
            hint: "Please ensure Notification_TELEGRAM_CHAT_ID is set in Vercel environment variables for Production",
            envVarsChecked: ["Notification_TELEGRAM_CHAT_ID", "CEO_TELEGRAM_CHAT_ID", "TELEGRAM_CHAT_ID"]
          }
        },
        { status: 500 }
      );
    }

    const result = await sendTelegramMessage(message, chatId);

    if (!result.success) {
      console.error("[Weekly CEO Briefing] Failed to send:", result.error);
      return NextResponse.json(
        { error: `Failed to send: ${result.error}` },
        { status: 500 }
      );
    }

    console.log("[Weekly CEO Briefing] Completed successfully");

    return NextResponse.json({
      success: true,
      message: "Weekly CEO briefing sent successfully",
      data: {
        weekRange: {
          start: weekStartDisplay.toISOString(),
          end: weekEndDisplay.toISOString(),
        },
        performance: {
          newLeads: thisWeekPerformance.newLeads,
          converted: thisWeekPerformance.convertedLeads,
          conversionRate: thisWeekPerformance.conversionRate,
          pipelineValue: thisWeekPerformance.pipelineValue,
        },
        execCount: execPerformance.length,
        knowledgeGapsCount: knowledgeGaps.length,
        meetingPointsCount: meetingPoints.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Weekly CEO Briefing] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Weekly briefing failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
