/**
 * AI Nudging System - Analytics API
 *
 * GET /api/nudges/analytics - Get nudge effectiveness metrics
 * POST /api/nudges/analytics - Record nudge action/outcome
 *
 * Phase 4: Tracks nudge effectiveness, action rates, and A/B test results
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

interface AnalyticsQuery {
  start_date?: string;
  end_date?: string;
  nudge_type?: string;
  ai_enhanced?: string;
  group_by?: "day" | "type" | "staff" | "template";
}

interface RecordActionInput {
  nudge_history_id: string;
  lead_id: string;
  action_taken: string;
  metadata?: Record<string, unknown>;
}

interface NudgeMetrics {
  total_sent: number;
  total_acted: number;
  action_rate: number;
  ai_enhanced_sent: number;
  ai_enhanced_acted: number;
  ai_action_rate: number;
  non_ai_action_rate: number;
  avg_time_to_action_minutes: number | null;
  conversions_attributed: number;
}

interface DailyStats {
  date: string;
  nudges_sent: number;
  actions_taken: number;
  action_rate: number;
  ai_action_rate: number | null;
}

/**
 * GET /api/nudges/analytics
 * Get nudge effectiveness metrics and statistics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("[Nudge Analytics] Fetching metrics...");

  try {
    const searchParams = request.nextUrl.searchParams;
    const query: AnalyticsQuery = {
      start_date: searchParams.get("start_date") || undefined,
      end_date: searchParams.get("end_date") || undefined,
      nudge_type: searchParams.get("nudge_type") || undefined,
      ai_enhanced: searchParams.get("ai_enhanced") || undefined,
      group_by:
        (searchParams.get("group_by") as AnalyticsQuery["group_by"]) ||
        undefined,
    };

    // Default to last 30 days
    const endDate = query.end_date || new Date().toISOString().split("T")[0];
    const startDate =
      query.start_date ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

    // Build base query
    let analyticsQuery = supabaseAdmin
      .from("nudge_analytics")
      .select("*")
      .gte("sent_at", `${startDate}T00:00:00Z`)
      .lte("sent_at", `${endDate}T23:59:59Z`);

    if (query.nudge_type) {
      analyticsQuery = analyticsQuery.eq("nudge_type", query.nudge_type);
    }

    if (query.ai_enhanced !== undefined) {
      analyticsQuery = analyticsQuery.eq(
        "ai_enhanced",
        query.ai_enhanced === "true",
      );
    }

    const { data: analytics, error: analyticsError } = await analyticsQuery;

    if (analyticsError) {
      console.error(
        "[Nudge Analytics] Error fetching analytics:",
        analyticsError,
      );
      return NextResponse.json(
        { success: false, error: "Failed to fetch analytics" },
        { status: 500 },
      );
    }

    // Calculate metrics
    const data = analytics || [];
    const totalSent = data.length;
    const totalActed = data.filter((a) => a.acted_at).length;
    const aiEnhanced = data.filter((a) => a.ai_enhanced);
    const nonAiEnhanced = data.filter((a) => !a.ai_enhanced);

    const metrics: NudgeMetrics = {
      total_sent: totalSent,
      total_acted: totalActed,
      action_rate: totalSent > 0 ? totalActed / totalSent : 0,
      ai_enhanced_sent: aiEnhanced.length,
      ai_enhanced_acted: aiEnhanced.filter((a) => a.acted_at).length,
      ai_action_rate:
        aiEnhanced.length > 0
          ? aiEnhanced.filter((a) => a.acted_at).length / aiEnhanced.length
          : 0,
      non_ai_action_rate:
        nonAiEnhanced.length > 0
          ? nonAiEnhanced.filter((a) => a.acted_at).length /
            nonAiEnhanced.length
          : 0,
      avg_time_to_action_minutes:
        totalActed > 0
          ? data
              .filter((a) => a.time_to_action_minutes != null)
              .reduce((sum, a) => sum + (a.time_to_action_minutes || 0), 0) /
            totalActed
          : null,
      conversions_attributed: data.filter((a) => a.contributed_to_conversion)
        .length,
    };

    // Get daily stats for trend
    const { data: dailyStats } = await supabaseAdmin
      .from("nudge_daily_stats")
      .select("*")
      .gte("stat_date", startDate)
      .lte("stat_date", endDate)
      .order("stat_date", { ascending: true });

    // Get template performance for A/B testing
    const { data: templates } = await supabaseAdmin
      .from("nudge_templates")
      .select("*")
      .eq("is_active", true)
      .order("send_count", { ascending: false });

    // Group by type if requested
    let groupedData: Record<string, NudgeMetrics> | undefined;
    if (query.group_by === "type") {
      groupedData = {};
      const types = [...new Set(data.map((a) => a.nudge_type))];
      for (const type of types) {
        const typeData = data.filter((a) => a.nudge_type === type);
        const typeActed = typeData.filter((a) => a.acted_at).length;
        groupedData[type] = {
          total_sent: typeData.length,
          total_acted: typeActed,
          action_rate: typeData.length > 0 ? typeActed / typeData.length : 0,
          ai_enhanced_sent: typeData.filter((a) => a.ai_enhanced).length,
          ai_enhanced_acted: typeData.filter((a) => a.ai_enhanced && a.acted_at)
            .length,
          ai_action_rate: 0,
          non_ai_action_rate: 0,
          avg_time_to_action_minutes: null,
          conversions_attributed: typeData.filter(
            (a) => a.contributed_to_conversion,
          ).length,
        };
      }
    }

    console.log("[Nudge Analytics] Metrics generated:", {
      totalSent,
      totalActed,
      actionRate: metrics.action_rate,
    });

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        daily_stats: dailyStats || [],
        templates: templates || [],
        grouped: groupedData,
        period: { start_date: startDate, end_date: endDate },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Nudge Analytics] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Analytics failed",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/nudges/analytics
 * Record a nudge action/outcome
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("[Nudge Analytics] Recording action...");

  try {
    const body = (await request.json()) as RecordActionInput;
    const { nudge_history_id, lead_id, action_taken, metadata } = body;

    if (!nudge_history_id || !lead_id || !action_taken) {
      return NextResponse.json(
        {
          success: false,
          error: "nudge_history_id, lead_id, and action_taken are required",
        },
        { status: 400 },
      );
    }

    // Get the nudge history record
    const { data: nudgeHistory, error: historyError } = await supabaseAdmin
      .from("nudge_history")
      .select("*")
      .eq("id", nudge_history_id)
      .single();

    if (historyError || !nudgeHistory) {
      return NextResponse.json(
        { success: false, error: "Nudge history record not found" },
        { status: 404 },
      );
    }

    // Get current lead state
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("status, ai_score")
      .eq("id", lead_id)
      .single();

    // Calculate time to action
    const sentAt = new Date(nudgeHistory.sent_at);
    const actedAt = new Date();
    const timeToActionMinutes = Math.round(
      (actedAt.getTime() - sentAt.getTime()) / (1000 * 60),
    );

    // Check if analytics record exists
    const { data: existingAnalytics } = await supabaseAdmin
      .from("nudge_analytics")
      .select("id")
      .eq("nudge_history_id", nudge_history_id)
      .single();

    if (existingAnalytics) {
      // Update existing record
      const { error: updateError } = await supabaseAdmin
        .from("nudge_analytics")
        .update({
          acted_at: actedAt.toISOString(),
          action_taken,
          time_to_action_minutes: timeToActionMinutes,
          lead_status_after: lead?.status || null,
          lead_score_after: lead?.ai_score || null,
          metadata: {
            ...(existingAnalytics as Record<string, unknown>),
            ...metadata,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAnalytics.id);

      if (updateError) {
        console.error("[Nudge Analytics] Update error:", updateError);
        return NextResponse.json(
          { success: false, error: "Failed to update analytics" },
          { status: 500 },
        );
      }
    } else {
      // Create new analytics record
      const { error: insertError } = await supabaseAdmin
        .from("nudge_analytics")
        .insert({
          nudge_history_id,
          lead_id,
          nudge_type: nudgeHistory.nudge_type,
          ai_enhanced: nudgeHistory.metadata?.ai_enhanced || false,
          message_template_id: nudgeHistory.metadata?.template_id || null,
          sent_at: nudgeHistory.sent_at,
          acted_at: actedAt.toISOString(),
          action_taken,
          time_to_action_minutes: timeToActionMinutes,
          lead_status_before: nudgeHistory.metadata?.lead_status || null,
          lead_status_after: lead?.status || null,
          lead_score_before: nudgeHistory.metadata?.lead_score || null,
          lead_score_after: lead?.ai_score || null,
          metadata,
        });

      if (insertError) {
        console.error("[Nudge Analytics] Insert error:", insertError);
        return NextResponse.json(
          { success: false, error: "Failed to record analytics" },
          { status: 500 },
        );
      }
    }

    console.log("[Nudge Analytics] Action recorded:", {
      nudge_history_id,
      lead_id,
      action_taken,
      time_to_action_minutes: timeToActionMinutes,
    });

    return NextResponse.json({
      success: true,
      message: "Action recorded",
      data: {
        time_to_action_minutes: timeToActionMinutes,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Nudge Analytics] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Recording failed",
      },
      { status: 500 },
    );
  }
}
