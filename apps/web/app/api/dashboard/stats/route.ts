export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

interface DashboardStats {
  totalLeads: number;
  hotLeads: number;
  dueToday: number;
  converted: number;
  newLeads: number;
  followUp: number;
  cold: number;
  lost: number;
}

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Get all stats in parallel (excluding archived leads)
    const [
      totalResult,
      hotResult,
      dueTodayResult,
      convertedResult,
      newResult,
      followUpResult,
      coldResult,
      lostResult,
    ] = await Promise.all([
      // Total leads (excluding archived)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_archived", false),

      // Hot leads (by temperature)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("lead_temperature", "hot")
        .eq("is_archived", false),

      // Due today (follow_up_date is today, open pipeline)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("follow_up_date", todayStr)
        .not("pipeline_stage", "in", "(order_won,closed_lost)")
        .eq("is_archived", false),

      // Converted (won)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_stage", "order_won")
        .eq("is_archived", false),

      // New (contact pending)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("lead_status", "new_contact_pending")
        .eq("is_archived", false),

      // Follow up scheduled
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("lead_status", "follow_up_scheduled")
        .eq("is_archived", false),

      // Cold (by temperature)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("lead_temperature", "cold")
        .eq("is_archived", false),

      // Lost
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_stage", "closed_lost")
        .eq("is_archived", false),
    ]);

    const stats: DashboardStats = {
      totalLeads: totalResult.count || 0,
      hotLeads: hotResult.count || 0,
      dueToday: dueTodayResult.count || 0,
      converted: convertedResult.count || 0,
      newLeads: newResult.count || 0,
      followUp: followUpResult.count || 0,
      cold: coldResult.count || 0,
      lost: lostResult.count || 0,
    };

    return success(stats);
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    return error("Internal server error", 500);
  }
}
