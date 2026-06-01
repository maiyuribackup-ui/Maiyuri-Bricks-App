export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";
import { startOfDay, startOfMonth, subDays } from "date-fns";

export interface BusinessHealthData {
  production: {
    today: number;
    target: number;
    mtd: number;
    trend: Array<{ date: string; count: number }>;
  };
  revenue: {
    mtd: number;
    target: number;
    recentPayments: Array<{ amount: number; date: string; leadName: string }>;
  };
  leads: {
    active: number;
    conversionRate: number;
    todayCalls: number;
    pendingFollowUps: number;
    pipeline: Array<{ status: string; count: number }>;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    leadName: string;
    description: string;
    timestamp: string;
    sentiment?: string;
    conversionScore?: number;
  }>;
}

// GET /api/business-health — daily business health overview
export async function GET() {
  try {
    const today = startOfDay(new Date());
    const monthStart = startOfMonth(today);
    const todayStr = today.toISOString().split("T")[0];
    const monthStartStr = monthStart.toISOString().split("T")[0];

    const [
      // Today's production shifts (completed shifts = batch output)
      todayShifts,
      // MTD production shifts
      mtdShifts,
      // Production orders with quantities
      mtdOrders,
      // Estimates/revenue (MTD)
      mtdEstimates,
      // All active leads
      leadsData,
      // Recent calls/recordings
      recentCalls,
      // Recent notes for activity
      recentNotes,
      // Upcoming tasks (follow-ups)
      upcomingTasks,
    ] = await Promise.all([
      supabaseAdmin
        .from("production_shifts")
        .select("id, shift_date, status")
        .gte("shift_date", todayStr)
        .lte("shift_date", todayStr),

      supabaseAdmin
        .from("production_shifts")
        .select("id, shift_date, status")
        .gte("shift_date", monthStartStr),

      supabaseAdmin
        .from("production_orders")
        .select("id, planned_quantity, actual_quantity, status, created_at")
        .gte("created_at", monthStartStr),

      supabaseAdmin
        .from("estimates")
        .select("id, total_cost, status, created_at, lead:leads(id, name)")
        .gte("created_at", monthStartStr),

      supabaseAdmin
        .from("leads")
        .select("id, name, pipeline_stage, created_at, follow_up_date")
        .eq("is_archived", false),

      supabaseAdmin
        .from("call_recordings")
        .select("id, lead:leads(id, name), status, sentiment, transcript, duration, created_at")
        .gte("created_at", subDays(today, 7).toISOString())
        .order("created_at", { ascending: false })
        .limit(10),

      supabaseAdmin
        .from("notes")
        .select("id, content, created_at, lead:leads(id, name)")
        .gte("created_at", subDays(today, 7).toISOString())
        .order("created_at", { ascending: false })
        .limit(10),

      supabaseAdmin
        .from("tasks")
        .select("id, title, due_date, priority, status")
        .neq("status", "done")
        .lte("due_date", today.toISOString())
        .order("due_date", { ascending: true })
        .limit(10),
    ]);

    // --- Production ---
    const todayShiftsData = todayShifts.data || [];
    const mtdShiftsData = mtdShifts.data || [];
    const mtdOrdersData = mtdOrders.data || [];

    // Count completed shifts as daily production batches (1 shift ≈ 1 batch of ~800 bricks)
    const todayProduction = todayShiftsData.filter((s) => s.status === "completed").length * 800;
    const mtdProduction = mtdShiftsData.filter((s) => s.status === "completed").length * 800;

    // Build 7-day trend from shifts
    const trend: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(today, i);
      const dateStr = d.toISOString().split("T")[0];
      const dayShifts = mtdShiftsData.filter((s) => s.shift_date === dateStr && s.status === "completed");
      trend.push({ date: dateStr.slice(5), count: dayShifts.length * 800 });
    }

    // --- Revenue ---
    const estimatesData = mtdEstimates.data || [];
    const wonEstimates = estimatesData.filter((e) => e.status === "accepted" || e.status === "converted");
    const mtdRevenue = wonEstimates.reduce((sum, e) => sum + (e.total_cost || 0), 0);
    const monthlyTarget = 150000;

    const recentPayments = wonEstimates
      .slice(-5)
      .reverse()
      .map((e) => ({
        amount: e.total_cost || 0,
        date: e.created_at,
        leadName: (e.lead as any)?.name || "Unknown",
      }));

    // --- Leads ---
    const leads = leadsData.data || [];
    const activeLeads = leads.filter((l) => !["order_won", "closed_lost"].includes(l.pipeline_stage));
    const wonLeads = leads.filter((l) => l.pipeline_stage === "order_won").length;
    const closedLeads = leads.filter((l) => ["order_won", "closed_lost"].includes(l.pipeline_stage)).length;
    const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0;

    // Today's calls
    const callsData = recentCalls.data || [];
    const todayCalls = callsData.filter((c) => {
      const callDate = new Date(c.created_at);
      return callDate >= today && callDate < new Date(today.getTime() + 86400000);
    }).length;

    // Pending follow-ups (tasks due today/overdue)
    const tasksData = upcomingTasks.data || [];
    const pendingFollowUps = tasksData.length;

    // Pipeline funnel (by V2 pipeline_stage)
    const stages = [
      "new_inquiry",
      "qualified_lead",
      "quote_shared",
      "factory_visit_proof",
      "decision_pending",
      "finalisation",
      "order_won",
      "closed_lost",
    ];
    const pipeline = stages.map((status) => ({
      status,
      count: leads.filter((l) => l.pipeline_stage === status).length,
    }));

    // --- Recent Activity ---
    const activity: BusinessHealthData["recentActivity"] = [];

    // Add recent calls
    callsData.slice(0, 5).forEach((c: any) => {
      const lead = c.lead;
      activity.push({
        id: `call-${c.id}`,
        type: "call",
        leadName: lead?.name || "Unknown",
        description: c.transcript ? c.transcript.slice(0, 100) + "..." : "Call recording processed",
        timestamp: c.created_at,
        sentiment: c.sentiment || "neutral",
        conversionScore: c.conversion_score || null,
      });
    });

    // Add recent notes
    recentNotes.data?.slice(0, 3).forEach((n: any) => {
      activity.push({
        id: `note-${n.id}`,
        type: "note",
        leadName: n.lead?.name || "Unknown",
        description: n.content?.slice(0, 100) || "Note added",
        timestamp: n.created_at,
      });
    });

    // Sort by timestamp descending
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const data: BusinessHealthData = {
      production: {
        today: todayProduction,
        target: 800,
        mtd: mtdProduction,
        trend,
      },
      revenue: {
        mtd: mtdRevenue,
        target: monthlyTarget,
        recentPayments,
      },
      leads: {
        active: activeLeads.length,
        conversionRate,
        todayCalls,
        pendingFollowUps,
        pipeline,
      },
      recentActivity: activity.slice(0, 8),
    };

    return success(data);
  } catch (err) {
    console.error("Error fetching business health data:", err);
    return error("Internal server error", 500);
  }
}
