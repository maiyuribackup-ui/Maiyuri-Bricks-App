/**
 * Coach Kernel
 * Staff performance coaching and insights
 * Uses Claude for coaching analysis
 */

import * as claude from "../../services/ai/claude";
import * as db from "../../services/supabase";
import type {
  CloudCoreResult,
  CoachingRequest,
  CoachingResponse,
  StaffMetrics,
  CoachingInsight,
  CoachingRecommendation,
  User,
} from "../../types";

export const KERNEL_CONFIG = {
  name: "Coach",
  description: "Provides staff performance coaching and insights",
  version: "1.0.0",
  defaultModel: "claude-sonnet-4-20250514",
  maxTokens: 2048,
  temperature: 0.6,
};

/**
 * Generate coaching insights for a staff member
 */
export async function coach(
  request: CoachingRequest,
): Promise<CloudCoreResult<CoachingResponse>> {
  const startTime = Date.now();

  try {
    // Get staff user
    const userResult = await db.getUser(request.staffId);
    if (!userResult.success || !userResult.data) {
      return {
        success: false,
        data: null,
        error: {
          code: "STAFF_NOT_FOUND",
          message: `Staff not found: ${request.staffId}`,
        },
      };
    }

    const user = userResult.data;
    const period = request.period || "month";

    // Get staff metrics
    const metricsResult = await db.getStaffMetrics(request.staffId, period);
    if (!metricsResult.success || !metricsResult.data) {
      return {
        success: false,
        data: null,
        error: {
          code: "METRICS_ERROR",
          message: "Failed to fetch staff metrics",
        },
      };
    }

    const rawMetrics = metricsResult.data;

    // Get additional metrics
    const additionalMetrics = await getAdditionalMetrics(
      request.staffId,
      period,
    );

    // Build staff metrics
    const metrics: StaffMetrics = {
      leadsHandled: rawMetrics.leadsHandled,
      conversionRate: rawMetrics.conversionRate,
      averageResponseTime: additionalMetrics.avgResponseTime,
      followUpCompletionRate: additionalMetrics.followUpCompletionRate,
      notesPerLead:
        rawMetrics.notesCount / Math.max(1, rawMetrics.leadsHandled),
      activeLeads: rawMetrics.activeLeads,
    };

    // Generate coaching using Claude
    const coachingResult = await generateCoaching(
      user,
      metrics,
      additionalMetrics,
      period,
      request.focusAreas,
      request.language || "en",
    );

    const response: CoachingResponse = {
      staffId: request.staffId,
      staffName: user.name,
      period: getPeriodLabel(period),
      metrics,
      insights: coachingResult.insights,
      recommendations: coachingResult.recommendations,
      overallScore: coachingResult.overallScore,
    };

    return {
      success: true,
      data: response,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("Coaching error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "COACHING_ERROR",
        message: error instanceof Error ? error.message : "Coaching failed",
      },
    };
  }
}

/**
 * Get additional metrics not covered by standard staff metrics
 */
async function getAdditionalMetrics(
  staffId: string,
  period: "week" | "month" | "quarter",
): Promise<{
  avgResponseTime: number;
  followUpCompletionRate: number;
  hotLeadsHandled: number;
  hotLeadsConverted: number;
}> {
  // Calculate date range
  const now = new Date();
  let startDate: Date;
  switch (period) {
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "quarter":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    // Get leads for more detailed analysis
    const { data: leads } = await db.supabase
      .from("leads")
      .select("id, status, follow_up_date, created_at, updated_at")
      .eq("assigned_staff", staffId)
      .gte("updated_at", startDate.toISOString());

    if (!leads || leads.length === 0) {
      return {
        avgResponseTime: 0,
        followUpCompletionRate: 0,
        hotLeadsHandled: 0,
        hotLeadsConverted: 0,
      };
    }

    // Get notes to calculate actual response times
    const { data: notes } = await db.supabase
      .from("notes")
      .select("created_at, lead_id")
      .eq("user_id", staffId)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });

    // Group notes by lead_id, get first note timestamp for each lead
    const firstNoteByLead = new Map<string, Date>();
    notes?.forEach((note) => {
      if (!firstNoteByLead.has(note.lead_id)) {
        firstNoteByLead.set(note.lead_id, new Date(note.created_at));
      }
    });

    // Calculate response times (lead creation to first note)
    const responseTimes: number[] = [];
    leads.forEach((lead) => {
      const firstNote = firstNoteByLead.get(lead.id);
      if (firstNote) {
        const leadCreated = new Date(lead.created_at);
        const hours =
          (firstNote.getTime() - leadCreated.getTime()) / (1000 * 60 * 60);
        // Only include reasonable response times (0-168 hours / 1 week)
        if (hours > 0 && hours < 168) {
          responseTimes.push(hours);
        }
      }
    });

    // Calculate average response time
    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(
            (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) *
              10,
          ) / 10
        : 0;

    // Calculate follow-up completion
    const leadsWithFollowUp = leads.filter((l) => l.follow_up_date);
    const pastFollowUps = leadsWithFollowUp.filter(
      (l) => new Date(l.follow_up_date) < now,
    );
    const completedFollowUps = pastFollowUps.filter(
      (l) =>
        l.status === "converted" ||
        l.status === "lost" ||
        new Date(l.updated_at) >= new Date(l.follow_up_date),
    );

    const followUpCompletionRate =
      pastFollowUps.length > 0
        ? completedFollowUps.length / pastFollowUps.length
        : 1;

    // Hot leads analysis
    const hotLeads = leads.filter(
      (l) => l.status === "hot" || l.status === "converted",
    );
    const hotLeadsConverted = leads.filter(
      (l) => l.status === "converted",
    ).length;

    return {
      avgResponseTime, // Now calculated from actual note timestamps
      followUpCompletionRate,
      hotLeadsHandled: hotLeads.length,
      hotLeadsConverted,
    };
  } catch (error) {
    console.error("Error getting additional metrics:", error);
    return {
      avgResponseTime: 0,
      followUpCompletionRate: 0,
      hotLeadsHandled: 0,
      hotLeadsConverted: 0,
    };
  }
}

/**
 * Generate coaching using Claude
 */
async function generateCoaching(
  user: User,
  metrics: StaffMetrics,
  additionalMetrics: Awaited<ReturnType<typeof getAdditionalMetrics>>,
  period: "week" | "month" | "quarter",
  focusAreas?: CoachingRequest["focusAreas"],
  language: "en" | "ta" = "en",
): Promise<{
  insights: CoachingInsight[];
  recommendations: CoachingRecommendation[];
  overallScore: number;
}> {
  const staffContext = `Name: ${user.name}
Role: ${user.role}
Period: ${getPeriodLabel(period)}`;

  const metricsContext = `Leads Handled: ${metrics.leadsHandled}
Conversion Rate: ${Math.round(metrics.conversionRate * 100)}%
Active Leads: ${metrics.activeLeads}
Notes per Lead: ${metrics.notesPerLead.toFixed(1)}
Average Response Time: ${metrics.averageResponseTime} hours
Follow-up Completion Rate: ${Math.round(metrics.followUpCompletionRate * 100)}%
Hot Leads Handled: ${additionalMetrics.hotLeadsHandled}
Hot Leads Converted: ${additionalMetrics.hotLeadsConverted}`;

  const focusContext = focusAreas?.length
    ? `Focus areas requested: ${focusAreas.join(", ")}`
    : "Analyze all performance areas";

  const result = await claude.generateCoachingInsights(
    staffContext,
    metricsContext + "\n" + focusContext,
    period,
    language,
  );

  if (result.success && result.data) {
    return {
      insights: result.data.insights.map((i) => ({
        type: i.type as CoachingInsight["type"],
        title: i.title,
        description: i.description,
        metric: i.metric,
        value: i.value,
      })),
      recommendations: result.data.recommendations.map((r) => ({
        priority: r.priority as CoachingRecommendation["priority"],
        area: r.area,
        action: r.action,
        expectedImpact: r.expectedImpact,
      })),
      overallScore: result.data.overallScore,
    };
  }

  // Fallback to rule-based coaching
  return generateRuleBasedCoaching(metrics, additionalMetrics);
}

/**
 * Generate rule-based coaching as fallback
 */
function generateRuleBasedCoaching(
  metrics: StaffMetrics,
  additionalMetrics: Awaited<ReturnType<typeof getAdditionalMetrics>>,
): {
  insights: CoachingInsight[];
  recommendations: CoachingRecommendation[];
  overallScore: number;
} {
  const insights: CoachingInsight[] = [];
  const recommendations: CoachingRecommendation[] = [];
  let score = 0.5;

  // Conversion rate analysis
  if (metrics.conversionRate >= 0.3) {
    insights.push({
      type: "strength",
      title: "Strong Conversion Rate",
      description: `Your conversion rate of ${Math.round(metrics.conversionRate * 100)}% is above average.`,
      metric: "conversionRate",
      value: metrics.conversionRate,
    });
    score += 0.15;
  } else if (metrics.conversionRate < 0.15) {
    insights.push({
      type: "improvement",
      title: "Conversion Rate Needs Attention",
      description: `Your conversion rate of ${Math.round(metrics.conversionRate * 100)}% is below target.`,
      metric: "conversionRate",
      value: metrics.conversionRate,
    });
    recommendations.push({
      priority: "high",
      area: "conversion",
      action: "Focus on qualifying leads earlier in the process",
      expectedImpact: "Improve conversion rate by 5-10%",
    });
    score -= 0.1;
  }

  // Notes per lead analysis
  if (metrics.notesPerLead >= 3) {
    insights.push({
      type: "strength",
      title: "Excellent Documentation",
      description: `Averaging ${metrics.notesPerLead.toFixed(1)} notes per lead shows thorough follow-up.`,
      metric: "notesPerLead",
      value: metrics.notesPerLead,
    });
    score += 0.1;
  } else if (metrics.notesPerLead < 1.5) {
    insights.push({
      type: "improvement",
      title: "Documentation Needs Improvement",
      description: `Only ${metrics.notesPerLead.toFixed(1)} notes per lead - aim for 3+ for better tracking.`,
      metric: "notesPerLead",
      value: metrics.notesPerLead,
    });
    recommendations.push({
      priority: "medium",
      area: "engagement",
      action: "Add notes after every significant interaction",
      expectedImpact: "Better lead tracking and handoff capability",
    });
    score -= 0.05;
  }

  // Follow-up completion analysis
  if (metrics.followUpCompletionRate >= 0.9) {
    insights.push({
      type: "strength",
      title: "Excellent Follow-up Discipline",
      description: `${Math.round(metrics.followUpCompletionRate * 100)}% follow-up completion rate.`,
      metric: "followUpCompletionRate",
      value: metrics.followUpCompletionRate,
    });
    score += 0.1;
  } else if (metrics.followUpCompletionRate < 0.7) {
    insights.push({
      type: "alert",
      title: "Follow-ups Being Missed",
      description: `Only ${Math.round(metrics.followUpCompletionRate * 100)}% of scheduled follow-ups completed.`,
      metric: "followUpCompletionRate",
      value: metrics.followUpCompletionRate,
    });
    recommendations.push({
      priority: "high",
      area: "follow_up",
      action: "Set daily reminders for pending follow-ups",
      expectedImpact: "Prevent leads from going cold",
    });
    score -= 0.15;
  }

  // Active leads analysis
  if (metrics.activeLeads > 20) {
    insights.push({
      type: "alert",
      title: "High Lead Volume",
      description: `Managing ${metrics.activeLeads} active leads - consider prioritization.`,
      metric: "activeLeads",
      value: metrics.activeLeads,
    });
    recommendations.push({
      priority: "medium",
      area: "engagement",
      action: "Prioritize hot leads and consider reassigning cold ones",
      expectedImpact: "Better focus on high-probability leads",
    });
  }

  // Normalize score
  score = Math.max(0, Math.min(1, score));

  return {
    insights,
    recommendations,
    overallScore: score,
  };
}

/**
 * Get period label
 */
function getPeriodLabel(period: "week" | "month" | "quarter"): string {
  switch (period) {
    case "week":
      return "Last 7 days";
    case "month":
      return "Last 30 days";
    case "quarter":
      return "Last 90 days";
  }
}

/**
 * Get team coaching summary
 */
export async function teamCoach(): Promise<
  CloudCoreResult<{
    teamMetrics: StaffMetrics;
    topPerformers: Array<{ staffId: string; staffName: string; score: number }>;
    improvementAreas: Array<{ area: string; description: string }>;
  }>
> {
  const startTime = Date.now();

  try {
    // Get all users
    const usersResult = await db.getUsers();
    if (!usersResult.success || !usersResult.data) {
      return {
        success: false,
        data: null,
        error: {
          code: "USERS_ERROR",
          message: "Failed to fetch users",
        },
      };
    }

    const staff = usersResult.data.filter((u) => u.role !== "founder");

    if (staff.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: "NO_STAFF",
          message: "No staff members found",
        },
      };
    }

    // Get coaching for each staff member
    const coachingResults = await Promise.all(
      staff.map((s) => coach({ staffId: s.id, period: "month" })),
    );

    // Aggregate team metrics
    const validResults = coachingResults
      .filter((r) => r.success && r.data)
      .map((r) => r.data!);

    const teamMetrics: StaffMetrics = {
      leadsHandled: validResults.reduce(
        (sum, r) => sum + r.metrics.leadsHandled,
        0,
      ),
      conversionRate:
        validResults.reduce((sum, r) => sum + r.metrics.conversionRate, 0) /
        validResults.length,
      averageResponseTime:
        validResults.reduce(
          (sum, r) => sum + r.metrics.averageResponseTime,
          0,
        ) / validResults.length,
      followUpCompletionRate:
        validResults.reduce(
          (sum, r) => sum + r.metrics.followUpCompletionRate,
          0,
        ) / validResults.length,
      notesPerLead:
        validResults.reduce((sum, r) => sum + r.metrics.notesPerLead, 0) /
        validResults.length,
      activeLeads: validResults.reduce(
        (sum, r) => sum + r.metrics.activeLeads,
        0,
      ),
    };

    // Sort by score for top performers
    const topPerformers = validResults
      .map((r) => ({
        staffId: r.staffId,
        staffName: r.staffName,
        score: r.overallScore,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // Find common improvement areas
    const allRecommendations = validResults.flatMap((r) => r.recommendations);
    const areaCount: Record<string, number> = {};
    allRecommendations.forEach((r) => {
      areaCount[r.area] = (areaCount[r.area] || 0) + 1;
    });

    const improvementAreas = Object.entries(areaCount)
      .filter(([_, count]) => count >= validResults.length / 2)
      .map(([area, count]) => ({
        area,
        description: `${count} team members need improvement in this area`,
      }));

    return {
      success: true,
      data: {
        teamMetrics,
        topPerformers,
        improvementAreas,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error("Team coaching error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "TEAM_COACHING_ERROR",
        message:
          error instanceof Error ? error.message : "Team coaching failed",
      },
    };
  }
}

export default {
  coach,
  teamCoach,
  KERNEL_CONFIG,
};
