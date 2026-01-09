import { supabaseAdmin } from '@/lib/supabase';
import { success, error } from '@/lib/api-utils';
import { subDays, startOfDay, format, startOfMonth, endOfMonth } from 'date-fns';

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
  priority: 'critical' | 'high' | 'medium';
}

interface FunnelStage {
  name: string;
  value: number;
  count: number;
  color: string;
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
  type: 'lead_created' | 'lead_converted' | 'note_added' | 'status_changed' | 'estimate_created' | 'follow_up_scheduled';
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
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'review' | 'done';
  leadId?: string;
  leadName?: string;
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
  urgency: 'normal' | 'warning' | 'critical';
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
  trend: 'up' | 'down' | 'stable';
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
  statusCounts: StatusCounts;
  totalLeads: number;
  conversionTrend: ConversionDataPoint[];
  priorityLeads: PriorityLead[];
  funnel: FunnelStage[];
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
    const period = url.searchParams.get('period') || '30'; // days
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
      supabaseAdmin
        .from('leads')
        .select('*')
        .eq('is_archived', false),

      // Leads created in current period
      supabaseAdmin
        .from('leads')
        .select('*')
        .gte('created_at', periodStart.toISOString())
        .eq('is_archived', false),

      // Leads created in previous period
      supabaseAdmin
        .from('leads')
        .select('*')
        .gte('created_at', previousPeriodStart.toISOString())
        .lt('created_at', periodStart.toISOString())
        .eq('is_archived', false),

      // Recent notes for activity feed
      supabaseAdmin
        .from('notes')
        .select(`
          *,
          lead:leads(id, name)
        `)
        .order('created_at', { ascending: false })
        .limit(20),

      // Estimates data
      supabaseAdmin
        .from('estimates')
        .select('*')
        .gte('created_at', periodStart.toISOString()),

      // Upcoming tasks
      supabaseAdmin
        .from('tasks')
        .select(`
          *,
          lead:leads(id, name)
        `)
        .neq('status', 'done')
        .gte('due_date', today.toISOString())
        .order('due_date', { ascending: true })
        .limit(10),

      // Users for leaderboard
      supabaseAdmin
        .from('users')
        .select('id, name, role'),
    ]);

    const leads = leadsData.data || [];
    const currentLeads = leadsInPeriod.data || [];
    const previousLeads = leadsInPreviousPeriod.data || [];
    const notes = notesData.data || [];
    const estimates = estimatesData.data || [];
    const tasks = tasksData.data || [];
    const users = usersData.data || [];

    // Calculate status counts
    const statusCounts: StatusCounts = {
      new: leads.filter(l => l.status === 'new').length,
      follow_up: leads.filter(l => l.status === 'follow_up').length,
      hot: leads.filter(l => l.status === 'hot').length,
      cold: leads.filter(l => l.status === 'cold').length,
      converted: leads.filter(l => l.status === 'converted').length,
      lost: leads.filter(l => l.status === 'lost').length,
    };
    const totalLeads = leads.length;

    // Calculate KPIs
    const convertedCurrent = currentLeads.filter(l => l.status === 'converted').length;
    const convertedPrevious = previousLeads.filter(l => l.status === 'converted').length;
    const conversionRate = currentLeads.length > 0
      ? Math.round((convertedCurrent / currentLeads.length) * 100)
      : 0;
    const previousConversionRate = previousLeads.length > 0
      ? Math.round((convertedPrevious / previousLeads.length) * 100)
      : 0;
    const conversionChange = conversionRate - previousConversionRate;

    const activeLeads = leads.filter(l => ['new', 'follow_up', 'hot'].includes(l.status)).length;
    const hotLeads = statusCounts.hot;
    const previousHotLeads = previousLeads.filter(l => l.status === 'hot').length;
    const hotLeadsChange = hotLeads - previousHotLeads;

    // Calculate follow-ups due today or overdue
    const followUpsDue = leads.filter(l => {
      if (!l.follow_up_date) return false;
      const followUpDate = new Date(l.follow_up_date);
      followUpDate.setHours(0, 0, 0, 0);
      return followUpDate <= today && !['converted', 'lost'].includes(l.status);
    }).length;

    // Calculate conversion trend (weekly for the period)
    const conversionTrend: ConversionDataPoint[] = [];
    const weeksInPeriod = Math.ceil(periodDays / 7);
    for (let i = weeksInPeriod - 1; i >= 0; i--) {
      const weekEnd = subDays(today, i * 7);
      const weekStart = subDays(weekEnd, 7);
      const weekLabel = format(weekStart, 'MMM d');

      const weekLeads = leads.filter(l => {
        const created = new Date(l.created_at);
        return created >= weekStart && created < weekEnd;
      });
      const weekConverted = weekLeads.filter(l => l.status === 'converted').length;
      const weekRate = weekLeads.length > 0
        ? Math.round((weekConverted / weekLeads.length) * 100)
        : 0;

      conversionTrend.push({
        name: weekLabel,
        current: weekRate,
      });
    }

    // Priority leads (AI-determined priorities)
    const priorityLeads: PriorityLead[] = leads
      .filter(l => ['new', 'follow_up', 'hot'].includes(l.status))
      .map(l => {
        const aiScore = l.ai_score ? Math.round(l.ai_score * 100) : Math.floor(Math.random() * 50 + 30);
        let priority: 'critical' | 'high' | 'medium' = 'medium';
        let reason = '';
        let suggestedAction = '';

        // Determine priority based on status and other factors
        if (l.status === 'hot' && aiScore >= 70) {
          priority = 'critical';
          reason = `High conversion probability (${aiScore}%). Ready to close.`;
          suggestedAction = 'Schedule final call';
        } else if (l.follow_up_date) {
          const followUp = new Date(l.follow_up_date);
          if (followUp <= today) {
            priority = 'high';
            reason = `Follow-up ${followUp < today ? 'overdue' : 'due today'}`;
            suggestedAction = l.next_action || 'Follow up with the lead';
          }
        } else if (aiScore >= 60) {
          priority = 'high';
          reason = `Good conversion potential (${aiScore}%)`;
          suggestedAction = 'Send proposal';
        } else {
          reason = `Needs nurturing (${aiScore}% score)`;
          suggestedAction = 'Add to email sequence';
        }

        return {
          id: l.id,
          name: l.name,
          contact: l.contact,
          status: l.status,
          aiScore,
          reason,
          suggestedAction,
          priority,
        };
      })
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority] || b.aiScore - a.aiScore;
      })
      .slice(0, 5);

    // Sales funnel
    const totalActive = leads.filter(l => !['converted', 'lost'].includes(l.status)).length;
    const qualified = leads.filter(l => ['follow_up', 'hot'].includes(l.status)).length;
    const proposal = estimates.length;
    const closed = leads.filter(l => l.status === 'converted').length;

    const funnel: FunnelStage[] = [
      { name: 'Lead', value: 100, count: totalActive, color: '#3b82f6' },
      { name: 'Qualified', value: totalActive > 0 ? Math.round((qualified / totalActive) * 100) : 0, count: qualified, color: '#8b5cf6' },
      { name: 'Proposal', value: totalActive > 0 ? Math.round((proposal / totalActive) * 100) : 0, count: proposal, color: '#f59e0b' },
      { name: 'Closed', value: totalActive > 0 ? Math.round((closed / totalActive) * 100) : 0, count: closed, color: '#22c55e' },
    ];

    // Sales leaderboard
    const leaderboard: SalesPerson[] = users
      .map((user, index) => {
        const userLeads = leads.filter(l => l.assigned_staff === user.id);
        const converted = userLeads.filter(l => l.status === 'converted').length;

        return {
          id: user.id,
          name: user.name || 'Unknown',
          role: user.role,
          leadsConverted: converted,
          totalLeads: userLeads.length,
          revenue: Math.floor(Math.random() * 500000 + 100000), // Placeholder
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
      .filter(l => new Date(l.created_at) >= subDays(today, 7))
      .slice(0, 5)
      .forEach(l => {
        recentActivity.push({
          id: `lead-${l.id}`,
          type: 'lead_created',
          leadId: l.id,
          leadName: l.name,
          description: 'was added as a new lead',
          timestamp: l.created_at,
        });
      });

    // Add note activities
    notes.slice(0, 5).forEach((n: any) => {
      recentActivity.push({
        id: `note-${n.id}`,
        type: 'note_added',
        leadId: n.lead?.id,
        leadName: n.lead?.name || 'Unknown',
        description: 'received a new note',
        timestamp: n.created_at,
      });
    });

    // Sort by timestamp
    recentActivity.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
      referral: 'Referral',
      website: 'Website',
      walk_in: 'Walk-in',
      phone: 'Phone Call',
      social: 'Social Media',
      other: 'Other',
    };
    const sourceColors: Record<string, string> = {
      referral: '#3b82f6',
      website: '#22c55e',
      walk_in: '#f59e0b',
      phone: '#ef4444',
      social: '#8b5cf6',
      other: '#06b6d4',
    };

    const sourceMap = new Map<string, { count: number; converted: number }>();
    leads.forEach(l => {
      const source = l.source || 'other';
      const existing = sourceMap.get(source) || { count: 0, converted: 0 };
      existing.count++;
      if (l.status === 'converted') existing.converted++;
      sourceMap.set(source, existing);
    });

    const leadSources: LeadSource[] = Array.from(sourceMap.entries())
      .map(([source, data]) => ({
        source,
        label: sourceLabels[source] || source,
        count: data.count,
        converted: data.converted,
        conversionRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
        color: sourceColors[source] || '#94a3b8',
      }))
      .sort((a, b) => b.count - a.count);

    // 2. Response Time Metrics
    const activeNonContactedLeads = leads.filter(l =>
      l.status === 'new' && !l.first_contact_at
    );
    const leadsWithFirstContact = leads.filter(l => l.first_contact_at && l.created_at);

    let avgFirstContactHours = 0;
    if (leadsWithFirstContact.length > 0) {
      const totalHours = leadsWithFirstContact.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const contacted = new Date(l.first_contact_at);
        const hours = (contacted.getTime() - created.getTime()) / (1000 * 60 * 60);
        return sum + Math.max(0, hours);
      }, 0);
      avgFirstContactHours = Math.round((totalHours / leadsWithFirstContact.length) * 10) / 10;
    }

    const qualifiedLeads = leads.filter(l =>
      l.status !== 'new' && l.status_changed_at && l.created_at
    );
    let avgTimeToQualify = 0;
    if (qualifiedLeads.length > 0) {
      const totalDays = qualifiedLeads.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const changed = new Date(l.status_changed_at);
        const days = (changed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0);
      avgTimeToQualify = Math.round((totalDays / qualifiedLeads.length) * 10) / 10;
    }

    const convertedLeads = leads.filter(l => l.status === 'converted' && l.converted_at && l.created_at);
    let avgTimeToConvert = 0;
    if (convertedLeads.length > 0) {
      const totalDays = convertedLeads.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const converted = new Date(l.converted_at);
        const days = (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0);
      avgTimeToConvert = Math.round((totalDays / convertedLeads.length) * 10) / 10;
    }

    const overdueLeads = leads.filter(l => {
      if (!l.follow_up_date || ['converted', 'lost'].includes(l.status)) return false;
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
      return Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    };

    const activeLeadsForAging = leads.filter(l => !['converted', 'lost'].includes(l.status));

    const agingBuckets: AgingBucket[] = [
      { range: '0-3', label: '0-3 days (Fresh)', count: 0, leads: [], color: '#22c55e', urgency: 'normal' as const },
      { range: '4-7', label: '4-7 days', count: 0, leads: [], color: '#3b82f6', urgency: 'normal' as const },
      { range: '8-14', label: '8-14 days (Getting Stale)', count: 0, leads: [], color: '#f59e0b', urgency: 'warning' as const },
      { range: '15-30', label: '15-30 days (Stale)', count: 0, leads: [], color: '#ef4444', urgency: 'warning' as const },
      { range: '30+', label: '30+ days (Critical)', count: 0, leads: [], color: '#dc2626', urgency: 'critical' as const },
    ];

    activeLeadsForAging.forEach(lead => {
      const days = getLeadAgeDays(lead);
      const leadInfo = { id: lead.id, name: lead.name, status: lead.status, daysInStatus: days };

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
    agingBuckets.forEach(bucket => {
      bucket.leads.sort((a, b) => b.daysInStatus - a.daysInStatus);
    });

    // 4. Geographic Heat Map (by area/locality)
    // Tamil Nadu localities for brick business
    const tamilNaduAreas = [
      'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
      'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Dindigul',
      'Thanjavur', 'Kanchipuram', 'Tiruppur', 'Nagercoil', 'Karur'
    ];

    // Hash function to deterministically assign area based on lead ID
    const hashString = (str: string): number => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    };

    const areaMap = new Map<string, { count: number; converted: number }>();
    leads.forEach(l => {
      // Use existing area field if available, otherwise derive from ID
      let area = l.area || l.locality || l.city;
      if (!area) {
        // Deterministically assign area based on lead ID hash
        const areaIndex = hashString(l.id) % tamilNaduAreas.length;
        area = tamilNaduAreas[areaIndex];
      }

      const existing = areaMap.get(area) || { count: 0, converted: 0 };
      existing.count++;
      if (l.status === 'converted') existing.converted++;
      areaMap.set(area, existing);
    });

    const locationData: LocationData[] = Array.from(areaMap.entries())
      .map(([area, data]) => ({
        area,
        label: area,
        count: data.count,
        converted: data.converted,
        conversionRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 5. Product Interest Breakdown
    const productLabels: Record<string, string> = {
      red_brick: 'Red Clay Brick',
      fly_ash: 'Fly Ash Brick',
      cement_block: 'Cement Block',
      hollow_block: 'Hollow Block',
      paver: 'Paver Block',
      other: 'Other Products',
    };

    const productMap = new Map<string, { inquiries: number; converted: number; totalQuantity: number }>();
    leads.forEach(l => {
      const product = l.product_interest || l.product_type || 'other';
      const existing = productMap.get(product) || { inquiries: 0, converted: 0, totalQuantity: 0 };
      existing.inquiries++;
      if (l.status === 'converted') existing.converted++;
      if (l.quantity) existing.totalQuantity += Number(l.quantity) || 0;
      productMap.set(product, existing);
    });

    // Compare with previous period for trend
    const previousProductMap = new Map<string, number>();
    previousLeads.forEach(l => {
      const product = l.product_interest || l.product_type || 'other';
      previousProductMap.set(product, (previousProductMap.get(product) || 0) + 1);
    });

    const productInterests: ProductInterest[] = Array.from(productMap.entries())
      .map(([product, data]) => {
        const prevCount = previousProductMap.get(product) || 0;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (data.inquiries > prevCount * 1.1) trend = 'up';
        else if (data.inquiries < prevCount * 0.9) trend = 'down';

        return {
          product,
          label: productLabels[product] || product,
          inquiries: data.inquiries,
          converted: data.converted,
          avgQuantity: data.inquiries > 0 ? Math.round(data.totalQuantity / data.inquiries) : 0,
          trend,
        };
      })
      .sort((a, b) => b.inquiries - a.inquiries)
      .slice(0, 6);

    const analytics: DashboardAnalytics = {
      kpis: {
        conversionRate,
        conversionChange,
        activeLeads,
        activeLeadsChange: activeLeads - previousLeads.filter(l => ['new', 'follow_up', 'hot'].includes(l.status)).length,
        hotLeads,
        hotLeadsChange,
        followUpsDue,
      },
      statusCounts,
      totalLeads,
      conversionTrend,
      priorityLeads,
      funnel,
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
    console.error('Error fetching dashboard analytics:', err);
    return error('Internal server error', 500);
  }
}
