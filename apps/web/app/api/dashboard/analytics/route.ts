export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";
import {
  subDays,
  startOfDay,
  format,
  startOfMonth,
  endOfMonth,
} from "date-fns";

interface ConversionDataPoint {
  name: string;
  current: number;
  previous?: number;
}

interface PriorityLead {
  id: string;
  name: string;
  contact?: string;
  status: string;
  aiScore: number;
  reason: string;
  suggestedAction: string;
  priority: "critical" | "high" | "medium";
}

interface FunnelStage {
  name: string;
  value: number;
  count: number;
  color: string;
}

interface PipelineStageCount {
  key: string;
  label: string;
  emoji: string;
  color: string;
  count: number;
}

interface SalesPerson {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  leadsConverted: number;
  totalLeads: number;
  revenue?: number;
  rank: number;
  change?: number;
}

interface Activity {
  id: string;
  type:
    | "lead_created"
    | "lead_converted"
    | "note_added"
    | "status_changed"
    | "estimate_created"
    | "follow_up_scheduled";
  leadId?: string;
  leadName: string;
  description: string;
  userId?: string;
  userName?: string;
  timestamp: string;
}

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "review" | "done";
  leadId?: string;
  leadName?: string;
}

/**
 * Transparent, additive lead score from real signals on the lead (mirrors the
 * sales-doc scoring table). Returns a 0..1 normalized score so it slots into
 * the existing `ai_score` shape. Used as a fallback when no AI score exists.
 */
function computeLeadScore(lead: any, today: Date): number {
  let pts = 0;
  // Source quality
  if (["referral", "website"].includes(lead.source)) pts += 15;
  else if (lead.source === "phone") pts += 8;
  // Pipeline progression
  const stagePts: Record<string, number> = {
    new_inquiry: 0,
    qualified_lead: 10,
    quote_shared: 20,
    factory_visit_proof: 25,
    decision_pending: 25,
    finalisation: 35,
  };
  pts += stagePts[lead.pipeline_stage] ?? 0;
  // Factory visit is a strong trust signal
  if (lead.factory_visit_status === "visited") pts += 35;
  else if (lead.factory_visit_status === "scheduled") pts += 20;
  // Commercial intent
  if (Number(lead.estimated_value) > 0) pts += 10;
  // Temperature nudge
  if (lead.lead_temperature === "hot") pts += 15;
  else if (lead.lead_temperature === "warm") pts += 5;
  // Recency penalty — stale leads lose points
  const ref = lead.last_interaction_at || lead.updated_at || lead.created_at;
  if (ref) {
    const days =
      (today.getTime() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24);
    if (days > 14) pts -= 20;
    else if (days > 7) pts -= 10;
  }
  // Normalize to 0..1 (cap at ~120 raw points)
  return Math.max(0, Math.min(1, pts / 120));
}

interface StatusCounts {
  new: number;
  follow_up: number;
  hot: number;
  cold: number;
  converted: number;
  lost: number;
}

interface LeadSource {
  source: string;
  label: string;
  count: number;
  converted: number;
  conversionRate: number;
  color: string;
}

interface ResponseMetrics {
  avgFirstContactHours: number;
  avgTimeToQualify: number;
  avgTimeToConvert: number;
  leadsWaitingContact: number;
  leadsOverdue: number;
}

interface AgingBucket {
  range: string;
  label: string;
  count: number;
  leads: Array<{
    id: string;
    name: string;
    status: string;
    daysInStatus: number;
  }>;
  color: string;
  urgency: "normal" | "warning" | "critical";
}

interface LocationData {
  area: string;
  label: string;
  count: number;
  converted: number;
  conversionRate: number;
}

interface ProductInterest {
  product: string;
  label: string;
  inquiries: number;
  converted: number;
  avgQuantity: number;
  trend: "up" | "down" | "stable";
}

interface RevenueKpis {
  revenueWon: number;
  pipelineValue: number;
  avgOrderValue: number;
  leadToOrderRate: number;
  quoteToOrderRate: number;
}

interface FactoryVisitStats {
  invited: number;
  scheduled: number;
  visited: number;
  noShow: number;
  notRequired: number;
  attendanceRate: number; // visited / (scheduled + visited + no_show)
  visitToOrderRate: number; // won-after-visit / visited
  postVisitLostRate: number; // lost-after-visit / visited
  avgDaysVisitToWon: number | null;
  wonAfterVisit: number;
  lostAfterVisit: number;
}

interface LostReasonStat {
  code: string;
  label: string;
  count: number;
}

interface Recommendation {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tone: "critical" | "warning" | "info" | "success";
}

interface DashboardAnalytics {
  kpis: {
    conversionRate: number;
    conversionChange: number;
    activeLeads: number;
    activeLeadsChange: number;
    hotLeads: number;
    hotLeadsChange: number;
    followUpsDue: number;
  };
  revenue: RevenueKpis;
  factoryVisit: FactoryVisitStats;
  lostReasons: LostReasonStat[];
  recommendations: Recommendation[];
  statusCounts: StatusCounts;
  totalLeads: number;
  conversionTrend: ConversionDataPoint[];
  priorityLeads: PriorityLead[];
  funnel: FunnelStage[];
  pipeline: PipelineStageCount[];
  leaderboard: SalesPerson[];
  recentActivity: Activity[];
  upcomingTasks: TaskItem[];
  // High Value Analytics
  leadSources: LeadSource[];
  responseMetrics: ResponseMetrics;
  agingBuckets: AgingBucket[];
  locationData: LocationData[];
  productInterests: ProductInterest[];
}

// GET /api/dashboard/analytics - Get comprehensive dashboard analytics
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "30"; // days
    const periodDays = parseInt(period, 10) || 30;

    const today = startOfDay(new Date());
    const periodStart = subDays(today, periodDays);
    const previousPeriodStart = subDays(periodStart, periodDays);

    // Fetch all data in parallel
    const [
      leadsData,
      leadsInPeriod,
      leadsInPreviousPeriod,
      notesData,
      estimatesData,
      tasksData,
      usersData,
    ] = await Promise.all([
      // All non-archived leads
      supabaseAdmin.from("leads").select("*").eq("is_archived", false),

      // Leads created in current period
      supabaseAdmin
        .from("leads")
        .select("*")
        .gte("created_at", periodStart.toISOString())
        .eq("is_archived", false),

      // Leads created in previous period
      supabaseAdmin
        .from("leads")
        .select("*")
        .gte("created_at", previousPeriodStart.toISOString())
        .lt("created_at", periodStart.toISOString())
        .eq("is_archived", false),

      // Recent notes for activity feed
      supabaseAdmin
        .from("notes")
        .select(
          `
          *,
          lead:leads(id, name)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(20),

      // Estimates data
      supabaseAdmin
        .from("estimates")
        .select("*")
        .gte("created_at", periodStart.toISOString()),

      // Upcoming tasks
      supabaseAdmin
        .from("tasks")
        .select(
          `
          *,
          lead:leads(id, name)
        `,
        )
        .neq("status", "done")
        .gte("due_date", today.toISOString())
        .order("due_date", { ascending: true })
        .limit(10),

      // Users for leaderboard
      supabaseAdmin.from("users").select("id, name, role"),
    ]);

    const leads = leadsData.data || [];
    const currentLeads = leadsInPeriod.data || [];
    const previousLeads = leadsInPreviousPeriod.data || [];
    const notes = notesData.data || [];
    const estimates = estimatesData.data || [];
    const tasks = tasksData.data || [];
    const users = usersData.data || [];

    // Calculate status counts (V2: keep the legacy keys for the existing
    // status-breakdown widget, but source them from the new taxonomy columns)
    const statusCounts: StatusCounts = {
      new: leads.filter((l) => l.lead_status === "new_contact_pending").length,
      follow_up: leads.filter((l) => l.lead_status === "follow_up_scheduled").length,
      hot: leads.filter((l) => l.lead_temperature === "hot").length,
      cold: leads.filter((l) => l.lead_temperature === "cold").length,
      converted: leads.filter((l) => l.pipeline_stage === "order_won").length,
      lost: leads.filter((l) => l.pipeline_stage === "closed_lost").length,
    };
    const totalLeads = leads.length;

    // V2 pipeline-stage breakdown (ordered sales journey) for the funnel + chart
    const PIPELINE_ORDER: Array<{ key: string; label: string; emoji: string; color: string }> = [
      { key: "new_inquiry", label: "New Inquiry", emoji: "💬", color: "#3b82f6" },
      { key: "qualified_lead", label: "Qualified Lead", emoji: "✅", color: "#06b6d4" },
      { key: "quote_shared", label: "Quote Shared", emoji: "📄", color: "#6366f1" },
      { key: "factory_visit_proof", label: "Factory Visit / Proof", emoji: "🏭", color: "#f59e0b" },
      { key: "decision_pending", label: "Decision Pending", emoji: "⏳", color: "#f97316" },
      { key: "finalisation", label: "Finalisation", emoji: "🤝", color: "#a855f7" },
      { key: "order_won", label: "Order Won", emoji: "🎉", color: "#22c55e" },
      { key: "closed_lost", label: "Closed Lost", emoji: "❌", color: "#94a3b8" },
    ];
    const pipeline = PIPELINE_ORDER.map((s) => ({
      ...s,
      count: leads.filter((l) => l.pipeline_stage === s.key).length,
    }));

    // Calculate KPIs
    const convertedCurrent = currentLeads.filter(
      (l) => l.pipeline_stage === "order_won",
    ).length;
    const convertedPrevious = previousLeads.filter(
      (l) => l.pipeline_stage === "order_won",
    ).length;
    const conversionRate =
      currentLeads.length > 0
        ? Math.round((convertedCurrent / currentLeads.length) * 100)
        : 0;
    const previousConversionRate =
      previousLeads.length > 0
        ? Math.round((convertedPrevious / previousLeads.length) * 100)
        : 0;
    const conversionChange = conversionRate - previousConversionRate;

    const activeLeads = leads.filter(
      (l) => !["order_won", "closed_lost"].includes(l.pipeline_stage),
    ).length;
    const hotLeads = statusCounts.hot;
    const previousHotLeads = previousLeads.filter(
      (l) => l.lead_temperature === "hot",
    ).length;
    const hotLeadsChange = hotLeads - previousHotLeads;

    // Calculate follow-ups due today or overdue
    const followUpsDue = leads.filter((l) => {
      if (!l.follow_up_date) return false;
      const followUpDate = new Date(l.follow_up_date);
      followUpDate.setHours(0, 0, 0, 0);
      return (
        followUpDate <= today &&
        !["order_won", "closed_lost"].includes(l.pipeline_stage)
      );
    }).length;

    // Calculate conversion trend (weekly for the period)
    const conversionTrend: ConversionDataPoint[] = [];
    const weeksInPeriod = Math.ceil(periodDays / 7);
    for (let i = weeksInPeriod - 1; i >= 0; i--) {
      const weekEnd = subDays(today, i * 7);
      const weekStart = subDays(weekEnd, 7);
      const weekLabel = format(weekStart, "MMM d");

      const weekLeads = leads.filter((l) => {
        const created = new Date(l.created_at);
        return created >= weekStart && created < weekEnd;
      });
      const weekConverted = weekLeads.filter(
        (l) => l.pipeline_stage === "order_won",
      ).length;
      const weekRate =
        weekLeads.length > 0
          ? Math.round((weekConverted / weekLeads.length) * 100)
          : 0;

      conversionTrend.push({
        name: weekLabel,
        current: weekRate,
      });
    }

    // Priority leads (AI-determined priorities)
    const priorityLeads: PriorityLead[] = leads
      .filter((l) => !["order_won", "closed_lost"].includes(l.pipeline_stage))
      .map((l) => {
        const normalizedScore = l.ai_score ?? computeLeadScore(l, today);
        const aiScore = Math.round(normalizedScore * 100);
        let priority: "critical" | "high" | "medium" = "medium";
        let reason = "";
        let suggestedAction = "";

        // Determine priority based on temperature and other factors
        if (l.lead_temperature === "hot" && aiScore >= 70) {
          priority = "critical";
          reason = `High conversion probability (${aiScore}%). Ready to close.`;
          suggestedAction = "Schedule final call";
        } else if (l.follow_up_date) {
          const followUp = new Date(l.follow_up_date);
          if (followUp <= today) {
            priority = "high";
            reason = `Follow-up ${followUp < today ? "overdue" : "due today"}`;
            suggestedAction = l.next_action || "Follow up with the lead";
          }
        } else if (aiScore >= 60) {
          priority = "high";
          reason = `Good conversion potential (${aiScore}%)`;
          suggestedAction = "Send proposal";
        } else {
          reason = `Needs nurturing (${aiScore}% score)`;
          suggestedAction = "Add to email sequence";
        }

        return {
          id: l.id,
          name: l.name,
          contact: l.contact,
          status: l.lead_status,
          aiScore,
          reason,
          suggestedAction,
          priority,
        };
      })
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2 };
        return (
          priorityOrder[a.priority] - priorityOrder[b.priority] ||
          b.aiScore - a.aiScore
        );
      })
      .slice(0, 5);

    // Sales funnel (V2): cumulative "reached at least this stage" along the
    // sales journey, so it forms a proper descending funnel. closed_lost is
    // excluded (it is not a progression stage).
    const stageRank: Record<string, number> = {
      new_inquiry: 0,
      qualified_lead: 1,
      quote_shared: 2,
      factory_visit_proof: 3,
      decision_pending: 4,
      finalisation: 5,
      order_won: 6,
    };
    const funnelDefs = [
      { name: "All Leads", minRank: 0, color: "#3b82f6" },
      { name: "Qualified+", minRank: 1, color: "#06b6d4" },
      { name: "Quote+", minRank: 2, color: "#6366f1" },
      { name: "Factory Visit+", minRank: 3, color: "#f59e0b" },
      { name: "Finalisation+", minRank: 5, color: "#a855f7" },
      { name: "Won", minRank: 6, color: "#22c55e" },
    ];
    // Count active (non-lost) leads at or beyond each stage rank
    const activeNonLost = leads.filter(
      (l) => l.pipeline_stage !== "closed_lost",
    );
    const topCount = activeNonLost.length || 1;
    const funnel: FunnelStage[] = funnelDefs.map((d) => {
      const count = activeNonLost.filter(
        (l) => (stageRank[l.pipeline_stage] ?? -1) >= d.minRank,
      ).length;
      return {
        name: d.name,
        value: Math.round((count / topCount) * 100),
        count,
        color: d.color,
      };
    });

    // Sales leaderboard
    const leaderboard: SalesPerson[] = users
      .map((user, index) => {
        const userLeads = leads.filter((l) => l.assigned_staff === user.id);
        const wonLeads = userLeads.filter(
          (l) => l.pipeline_stage === "order_won",
        );
        const converted = wonLeads.length;
        // Real revenue: sum of confirmed final_order_value on won leads
        const revenue = wonLeads.reduce(
          (sum, l) => sum + (Number(l.final_order_value) || 0),
          0,
        );

        return {
          id: user.id,
          name: user.name || "Unknown",
          role: user.role,
          leadsConverted: converted,
          totalLeads: userLeads.length,
          revenue,
          rank: index + 1,
        };
      })
      .sort((a, b) => b.leadsConverted - a.leadsConverted)
      .map((person, index) => ({ ...person, rank: index + 1 }))
      .slice(0, 5);

    // Recent activity
    const recentActivity: Activity[] = [];

    // Add lead creation activities
    leads
      .filter((l) => new Date(l.created_at) >= subDays(today, 7))
      .slice(0, 5)
      .forEach((l) => {
        recentActivity.push({
          id: `lead-${l.id}`,
          type: "lead_created",
          leadId: l.id,
          leadName: l.name,
          description: "was added as a new lead",
          timestamp: l.created_at,
        });
      });

    // Add note activities
    notes.slice(0, 5).forEach((n: any) => {
      recentActivity.push({
        id: `note-${n.id}`,
        type: "note_added",
        leadId: n.lead?.id,
        leadName: n.lead?.name || "Unknown",
        description: "received a new note",
        timestamp: n.created_at,
      });
    });

    // Sort by timestamp
    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Upcoming tasks
    const upcomingTasks: TaskItem[] = tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dueDate: t.due_date,
      priority: t.priority,
      status: t.status,
      leadId: t.lead?.id,
      leadName: t.lead?.name,
    }));

    // ==========================================
    // HIGH VALUE ANALYTICS
    // ==========================================

    // 1. Lead Source Analytics
    const sourceLabels: Record<string, string> = {
      referral: "Referral",
      website: "Website",
      walk_in: "Walk-in",
      phone: "Phone Call",
      social: "Social Media",
      other: "Other",
    };
    const sourceColors: Record<string, string> = {
      referral: "#3b82f6",
      website: "#22c55e",
      walk_in: "#f59e0b",
      phone: "#ef4444",
      social: "#8b5cf6",
      other: "#06b6d4",
    };

    const sourceMap = new Map<string, { count: number; converted: number }>();
    leads.forEach((l) => {
      const source = l.source || "other";
      const existing = sourceMap.get(source) || { count: 0, converted: 0 };
      existing.count++;
      if (l.pipeline_stage === "order_won") existing.converted++;
      sourceMap.set(source, existing);
    });

    const leadSources: LeadSource[] = Array.from(sourceMap.entries())
      .map(([source, data]) => ({
        source,
        label: sourceLabels[source] || source,
        count: data.count,
        converted: data.converted,
        conversionRate:
          data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
        color: sourceColors[source] || "#94a3b8",
      }))
      .sort((a, b) => b.count - a.count);

    // 2. Response Time Metrics
    const activeNonContactedLeads = leads.filter(
      (l) => l.lead_status === "new_contact_pending" && !l.first_contact_at,
    );
    const leadsWithFirstContact = leads.filter(
      (l) => l.first_contact_at && l.created_at,
    );

    let avgFirstContactHours = 0;
    if (leadsWithFirstContact.length > 0) {
      const totalHours = leadsWithFirstContact.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const contacted = new Date(l.first_contact_at);
        const hours =
          (contacted.getTime() - created.getTime()) / (1000 * 60 * 60);
        return sum + Math.max(0, hours);
      }, 0);
      avgFirstContactHours =
        Math.round((totalHours / leadsWithFirstContact.length) * 10) / 10;
    }

    const qualifiedLeads = leads.filter(
      (l) =>
        l.lead_status !== "new_contact_pending" &&
        l.status_changed_at &&
        l.created_at,
    );
    let avgTimeToQualify = 0;
    if (qualifiedLeads.length > 0) {
      const totalDays = qualifiedLeads.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const changed = new Date(l.status_changed_at);
        const days =
          (changed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0);
      avgTimeToQualify =
        Math.round((totalDays / qualifiedLeads.length) * 10) / 10;
    }

    const convertedLeads = leads.filter(
      (l) => l.pipeline_stage === "order_won" && l.converted_at && l.created_at,
    );
    let avgTimeToConvert = 0;
    if (convertedLeads.length > 0) {
      const totalDays = convertedLeads.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const converted = new Date(l.converted_at);
        const days =
          (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0);
      avgTimeToConvert =
        Math.round((totalDays / convertedLeads.length) * 10) / 10;
    }

    const overdueLeads = leads.filter((l) => {
      if (
        !l.follow_up_date ||
        ["order_won", "closed_lost"].includes(l.pipeline_stage)
      )
        return false;
      const followUp = new Date(l.follow_up_date);
      followUp.setHours(0, 0, 0, 0);
      return followUp < today;
    });

    const responseMetrics: ResponseMetrics = {
      avgFirstContactHours,
      avgTimeToQualify,
      avgTimeToConvert,
      leadsWaitingContact: activeNonContactedLeads.length,
      leadsOverdue: overdueLeads.length,
    };

    // 3. Lead Aging Report
    const getLeadAgeDays = (lead: any): number => {
      const created = new Date(lead.created_at);
      return Math.floor(
        (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
      );
    };

    const activeLeadsForAging = leads.filter(
      (l) => !["order_won", "closed_lost"].includes(l.pipeline_stage),
    );

    const agingBuckets: AgingBucket[] = [
      {
        range: "0-3",
        label: "0-3 days (Fresh)",
        count: 0,
        leads: [],
        color: "#22c55e",
        urgency: "normal" as const,
      },
      {
        range: "4-7",
        label: "4-7 days",
        count: 0,
        leads: [],
        color: "#3b82f6",
        urgency: "normal" as const,
      },
      {
        range: "8-14",
        label: "8-14 days (Getting Stale)",
        count: 0,
        leads: [],
        color: "#f59e0b",
        urgency: "warning" as const,
      },
      {
        range: "15-30",
        label: "15-30 days (Stale)",
        count: 0,
        leads: [],
        color: "#ef4444",
        urgency: "warning" as const,
      },
      {
        range: "30+",
        label: "30+ days (Critical)",
        count: 0,
        leads: [],
        color: "#dc2626",
        urgency: "critical" as const,
      },
    ];

    activeLeadsForAging.forEach((lead) => {
      const days = getLeadAgeDays(lead);
      const leadInfo = {
        id: lead.id,
        name: lead.name,
        status: lead.status,
        daysInStatus: days,
      };

      if (days <= 3) {
        agingBuckets[0].count++;
        agingBuckets[0].leads.push(leadInfo);
      } else if (days <= 7) {
        agingBuckets[1].count++;
        agingBuckets[1].leads.push(leadInfo);
      } else if (days <= 14) {
        agingBuckets[2].count++;
        agingBuckets[2].leads.push(leadInfo);
      } else if (days <= 30) {
        agingBuckets[3].count++;
        agingBuckets[3].leads.push(leadInfo);
      } else {
        agingBuckets[4].count++;
        agingBuckets[4].leads.push(leadInfo);
      }
    });

    // Sort leads within each bucket by age (oldest first)
    agingBuckets.forEach((bucket) => {
      bucket.leads.sort((a, b) => b.daysInStatus - a.daysInStatus);
    });

    // 4. Geographic breakdown (by real area / locality). No fabrication:
    // leads without an area are bucketed as "Unknown" so the chart is honest.
    const areaMap = new Map<string, { count: number; converted: number }>();
    leads.forEach((l) => {
      const area =
        (l.area || l.site_location || l.site_region || "").trim() || "Unknown";
      const existing = areaMap.get(area) || { count: 0, converted: 0 };
      existing.count++;
      if (l.pipeline_stage === "order_won") existing.converted++;
      areaMap.set(area, existing);
    });

    const locationData: LocationData[] = Array.from(areaMap.entries())
      .map(([area, data]) => ({
        area,
        label: area,
        count: data.count,
        converted: data.converted,
        conversionRate:
          data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 5. Product Interest Breakdown
    const productLabels: Record<string, string> = {
      red_brick: "Red Clay Brick",
      fly_ash: "Fly Ash Brick",
      cement_block: "Cement Block",
      hollow_block: "Hollow Block",
      paver: "Paver Block",
      other: "Other Products",
    };

    const productMap = new Map<
      string,
      { inquiries: number; converted: number; totalQuantity: number }
    >();
    leads.forEach((l) => {
      const product = l.product_interest || l.product_type || "other";
      const existing = productMap.get(product) || {
        inquiries: 0,
        converted: 0,
        totalQuantity: 0,
      };
      existing.inquiries++;
      if (l.pipeline_stage === "order_won") existing.converted++;
      if (l.quantity) existing.totalQuantity += Number(l.quantity) || 0;
      productMap.set(product, existing);
    });

    // Compare with previous period for trend
    const previousProductMap = new Map<string, number>();
    previousLeads.forEach((l) => {
      const product = l.product_interest || l.product_type || "other";
      previousProductMap.set(
        product,
        (previousProductMap.get(product) || 0) + 1,
      );
    });

    const productInterests: ProductInterest[] = Array.from(productMap.entries())
      .map(([product, data]) => {
        const prevCount = previousProductMap.get(product) || 0;
        let trend: "up" | "down" | "stable" = "stable";
        if (data.inquiries > prevCount * 1.1) trend = "up";
        else if (data.inquiries < prevCount * 0.9) trend = "down";

        return {
          product,
          label: productLabels[product] || product,
          inquiries: data.inquiries,
          converted: data.converted,
          avgQuantity:
            data.inquiries > 0
              ? Math.round(data.totalQuantity / data.inquiries)
              : 0,
          trend,
        };
      })
      .sort((a, b) => b.inquiries - a.inquiries)
      .slice(0, 6);

    // ==========================================
    // REVENUE KPIs (real money — native deal-value fields)
    // ==========================================
    const wonLeadsAll = leads.filter((l) => l.pipeline_stage === "order_won");
    const revenueWon = wonLeadsAll.reduce(
      (sum, l) => sum + (Number(l.final_order_value) || 0),
      0,
    );
    const activeStageKeys = [
      "new_inquiry",
      "qualified_lead",
      "quote_shared",
      "factory_visit_proof",
      "decision_pending",
      "finalisation",
    ];
    const pipelineValue = leads
      .filter((l) => activeStageKeys.includes(l.pipeline_stage))
      .reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);
    const ordersWithValue = wonLeadsAll.filter(
      (l) => Number(l.final_order_value) > 0,
    ).length;
    const avgOrderValue =
      ordersWithValue > 0 ? Math.round(revenueWon / ordersWithValue) : 0;
    const quotePlusReached = leads.filter(
      (l) => (stageRank[l.pipeline_stage] ?? -1) >= 2,
    ).length;
    const revenue: RevenueKpis = {
      revenueWon,
      pipelineValue,
      avgOrderValue,
      leadToOrderRate:
        totalLeads > 0
          ? Math.round((wonLeadsAll.length / totalLeads) * 100)
          : 0,
      quoteToOrderRate:
        quotePlusReached > 0
          ? Math.round((wonLeadsAll.length / quotePlusReached) * 100)
          : 0,
    };

    // ==========================================
    // FACTORY-VISIT CONVERSION
    // ==========================================
    const fvCount = (s: string) =>
      leads.filter((l) => l.factory_visit_status === s).length;
    const visitedLeads = leads.filter(
      (l) => l.factory_visit_status === "visited",
    );
    const wonAfterVisit = visitedLeads.filter(
      (l) => l.pipeline_stage === "order_won",
    ).length;
    const lostAfterVisit = visitedLeads.filter(
      (l) => l.pipeline_stage === "closed_lost",
    ).length;
    const scheduledCount = fvCount("scheduled");
    const noShowCount = fvCount("no_show");
    const attendanceDenom = scheduledCount + visitedLeads.length + noShowCount;
    // avg days from factory_visit_at -> won_at (only where both present)
    const visitToWonDurations = visitedLeads
      .filter((l) => l.factory_visit_at && l.won_at)
      .map(
        (l) =>
          (new Date(l.won_at).getTime() -
            new Date(l.factory_visit_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
      .filter((d) => d >= 0);
    const factoryVisit: FactoryVisitStats = {
      invited: fvCount("invited"),
      scheduled: scheduledCount,
      visited: visitedLeads.length,
      noShow: noShowCount,
      notRequired: fvCount("not_required"),
      attendanceRate:
        attendanceDenom > 0
          ? Math.round((visitedLeads.length / attendanceDenom) * 100)
          : 0,
      visitToOrderRate:
        visitedLeads.length > 0
          ? Math.round((wonAfterVisit / visitedLeads.length) * 100)
          : 0,
      postVisitLostRate:
        visitedLeads.length > 0
          ? Math.round((lostAfterVisit / visitedLeads.length) * 100)
          : 0,
      avgDaysVisitToWon:
        visitToWonDurations.length > 0
          ? Math.round(
              visitToWonDurations.reduce((a, b) => a + b, 0) /
                visitToWonDurations.length,
            )
          : null,
      wonAfterVisit,
      lostAfterVisit,
    };

    // ==========================================
    // LOST-REASON INTELLIGENCE
    // ==========================================
    const lostReasonLabels: Record<string, string> = {
      price_too_high: "Price too high",
      chose_kerala_competitor: "Chose Kerala competitor",
      chose_conventional_aac: "Chose conventional / AAC",
      project_delayed: "Project delayed",
      customer_not_reachable: "Not reachable",
      no_genuine_requirement: "No genuine requirement",
      transport_delivery_cost: "Transport / delivery cost",
      engineer_mason_not_convinced: "Engineer/mason not convinced",
      family_decision_delayed: "Family decision delayed",
      other: "Other",
    };
    const lostLeads = leads.filter((l) => l.pipeline_stage === "closed_lost");
    const lostReasonMap = new Map<string, number>();
    lostLeads.forEach((l) => {
      const code = l.lost_reason_code || "other";
      lostReasonMap.set(code, (lostReasonMap.get(code) || 0) + 1);
    });
    const lostReasons: LostReasonStat[] = Array.from(lostReasonMap.entries())
      .map(([code, count]) => ({
        code,
        label: lostReasonLabels[code] || code,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // ==========================================
    // RECOMMENDATION ENGINE (rule-based v1)
    // ==========================================
    const recommendations: Recommendation[] = [];
    // 1. Hot leads with no follow-up scheduled
    const hotNoFollowUp = leads.filter(
      (l) =>
        l.lead_temperature === "hot" &&
        !["order_won", "closed_lost"].includes(l.pipeline_stage) &&
        !l.follow_up_date,
    ).length;
    if (hotNoFollowUp > 0) {
      recommendations.push({
        id: "hot-no-followup",
        icon: "🔥",
        title: `${hotNoFollowUp} hot lead${hotNoFollowUp === 1 ? "" : "s"} with no follow-up scheduled`,
        detail: "Assign a call today before they cool off.",
        tone: "critical",
      });
    }
    // 2. Overdue follow-ups
    if (responseMetrics.leadsOverdue > 0) {
      recommendations.push({
        id: "overdue",
        icon: "⏰",
        title: `${responseMetrics.leadsOverdue} overdue follow-up${responseMetrics.leadsOverdue === 1 ? "" : "s"}`,
        detail: "These are leaking from the pipeline — clear them first.",
        tone: "warning",
      });
    }
    // 3. Factory visits not converting
    if (factoryVisit.visited >= 3 && factoryVisit.visitToOrderRate < 30) {
      const topLost = lostReasons[0];
      recommendations.push({
        id: "factory-conv",
        icon: "🏭",
        title: `Only ${factoryVisit.visitToOrderRate}% of factory visitors convert`,
        detail: topLost
          ? `Top lost reason: ${topLost.label}. Add a post-visit value follow-up.`
          : "Add a structured post-visit follow-up sequence.",
        tone: "warning",
      });
    }
    // 4. Best source — lean in
    const rankedSources = [...leadSources]
      .filter((s) => s.count >= 3)
      .sort((a, b) => b.conversionRate - a.conversionRate);
    if (rankedSources.length >= 2) {
      const best = rankedSources[0];
      const worst = rankedSources[rankedSources.length - 1];
      if (best.conversionRate >= worst.conversionRate * 2 && best.conversionRate > 0) {
        recommendations.push({
          id: "best-source",
          icon: "🎯",
          title: `${best.label} converts best (${best.conversionRate}%)`,
          detail: `vs ${worst.label} at ${worst.conversionRate}%. Shift effort toward ${best.label}.`,
          tone: "success",
        });
      }
    }
    // 5. Stale leads
    const staleCount =
      agingBuckets.find((b) => b.range === "30+")?.count ?? 0;
    if (staleCount > 0) {
      recommendations.push({
        id: "stale",
        icon: "🧹",
        title: `${staleCount} active lead${staleCount === 1 ? "" : "s"} are 30+ days old`,
        detail: "Re-engage or move to nurture/closed to keep the pipeline clean.",
        tone: "info",
      });
    }

    const analytics: DashboardAnalytics = {
      kpis: {
        conversionRate,
        conversionChange,
        activeLeads,
        activeLeadsChange:
          activeLeads -
          previousLeads.filter(
            (l) => !["order_won", "closed_lost"].includes(l.pipeline_stage),
          ).length,
        hotLeads,
        hotLeadsChange,
        followUpsDue,
      },
      revenue,
      factoryVisit,
      lostReasons,
      recommendations,
      statusCounts,
      totalLeads,
      conversionTrend,
      priorityLeads,
      funnel,
      pipeline,
      leaderboard,
      recentActivity: recentActivity.slice(0, 10),
      upcomingTasks,
      // High Value Analytics
      leadSources,
      responseMetrics,
      agingBuckets,
      locationData,
      productInterests,
    };

    return success(analytics);
  } catch (err) {
    console.error("Error fetching dashboard analytics:", err);
    return error("Internal server error", 500);
  }
}
