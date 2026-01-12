'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Select } from '@maiyuri/ui';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  KPICard,
  ConversionChart,
  AIPriorityActions,
  SalesFunnel,
  SalesLeaderboard,
  RecentActivity,
  UpcomingTasks,
  LeadStatusBreakdown,
  getDefaultStatusCounts,
  LeadSourceAnalytics,
  ResponseTimeMetrics,
  LeadAgingReport,
  GeographicHeatMap,
  ProductInterestBreakdown,
} from '@/components/dashboard';

interface StatusCounts {
  new: number;
  follow_up: number;
  hot: number;
  cold: number;
  converted: number;
  lost: number;
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
  conversionTrend: Array<{ name: string; current: number; previous?: number }>;
  priorityLeads: Array<{
    id: string;
    name: string;
    contact?: string;
    status: string;
    aiScore: number;
    reason: string;
    suggestedAction: string;
    priority: 'critical' | 'high' | 'medium';
  }>;
  funnel: Array<{
    name: string;
    value: number;
    count: number;
    color: string;
  }>;
  leaderboard: Array<{
    id: string;
    name: string;
    avatar?: string;
    role?: string;
    leadsConverted: number;
    totalLeads: number;
    revenue?: number;
    rank: number;
    change?: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: 'lead_created' | 'lead_converted' | 'note_added' | 'status_changed' | 'estimate_created' | 'follow_up_scheduled';
    leadId?: string;
    leadName: string;
    description: string;
    userId?: string;
    userName?: string;
    timestamp: string;
  }>;
  upcomingTasks: Array<{
    id: string;
    title: string;
    description?: string;
    dueDate: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    status: 'todo' | 'in_progress' | 'review' | 'done';
    leadId?: string;
    leadName?: string;
  }>;
  // High Value Analytics
  leadSources: Array<{
    source: string;
    label: string;
    count: number;
    converted: number;
    conversionRate: number;
    color: string;
  }>;
  responseMetrics: {
    avgFirstContactHours: number;
    avgTimeToQualify: number;
    avgTimeToConvert: number;
    leadsWaitingContact: number;
    leadsOverdue: number;
  };
  agingBuckets: Array<{
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
  }>;
  locationData: Array<{
    area: string;
    label: string;
    count: number;
    converted: number;
    conversionRate: number;
  }>;
  productInterests: Array<{
    product: string;
    label: string;
    inquiries: number;
    converted: number;
    avgQuantity: number;
    trend: 'up' | 'down' | 'stable';
  }>;
}

async function fetchAnalytics(period: string): Promise<DashboardAnalytics> {
  const res = await fetch(`/api/dashboard/analytics?period=${period}`);
  if (!res.ok) throw new Error('Failed to fetch analytics');
  const json = await res.json();
  return json.data;
}

const periodOptions = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export default function DashboardPage() {
  const [period, setPeriod] = useState('30');
  const queryClient = useQueryClient();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['dashboard-analytics', period],
    queryFn: () => fetchAnalytics(period),
  });

  const statusCountsData = analytics?.statusCounts
    ? getDefaultStatusCounts(analytics.statusCounts)
    : [];

  // Handle call/message actions for priority leads
  const handleLeadAction = useCallback((leadId: string, action: string) => {
    const lead = analytics?.priorityLeads?.find(l => l.id === leadId);
    if (!lead?.contact) {
      toast.error('No contact information available');
      return;
    }

    // Clean phone number (remove spaces, dashes)
    const cleanPhone = lead.contact.replace(/[\s-]/g, '');

    if (action === 'call') {
      // Open phone dialer
      window.location.href = `tel:${cleanPhone}`;
      toast.success(`Calling ${lead.name}...`);
    } else if (action === 'message') {
      // Open WhatsApp (common in India) or SMS
      const whatsappUrl = `https://wa.me/${cleanPhone.replace(/^\+/, '')}`;
      window.open(whatsappUrl, '_blank');
      toast.success(`Opening WhatsApp for ${lead.name}...`);
    }
  }, [analytics?.priorityLeads]);

  // Handle task completion
  const handleTaskComplete = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });

      if (!res.ok) throw new Error('Failed to complete task');

      toast.success('Task marked as complete');
      // Refresh dashboard data
      queryClient.invalidateQueries({ queryKey: ['dashboard-analytics'] });
    } catch (error) {
      console.error('Task completion error:', error);
      toast.error('Failed to complete task');
    }
  }, [queryClient]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Sales Analytics Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track performance, conversions, and AI-powered insights
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-40"
          />
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <PlusIcon className="h-5 w-5" />
            New Lead
          </Link>
        </div>
      </div>

      {/* Status-wise Lead Counts - Full Width */}
      <LeadStatusBreakdown
        statusCounts={statusCountsData}
        totalLeads={analytics?.totalLeads ?? 0}
        loading={isLoading}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Conversion Rate"
          value={analytics?.kpis.conversionRate ?? 0}
          suffix="%"
          change={analytics?.kpis.conversionChange}
          icon={<ChartIcon className="h-4 w-4" />}
          loading={isLoading}
          variant="primary"
        />
        <KPICard
          title="Active Leads"
          value={analytics?.kpis.activeLeads ?? 0}
          change={analytics?.kpis.activeLeadsChange}
          icon={<UsersIcon className="h-4 w-4" />}
          loading={isLoading}
        />
        <KPICard
          title="Hot Leads"
          value={analytics?.kpis.hotLeads ?? 0}
          change={analytics?.kpis.hotLeadsChange}
          icon={<FireIcon className="h-4 w-4" />}
          loading={isLoading}
          variant="warning"
        />
        <KPICard
          title="Follow-ups Due"
          value={analytics?.kpis.followUpsDue ?? 0}
          icon={<ClockIcon className="h-4 w-4" />}
          loading={isLoading}
          variant={analytics?.kpis.followUpsDue && analytics.kpis.followUpsDue > 5 ? 'warning' : 'default'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversionChart
          data={analytics?.conversionTrend || []}
          title="Conversion Over Time"
          loading={isLoading}
        />
        <SalesFunnel
          stages={analytics?.funnel || []}
          title="Sales Funnel"
          loading={isLoading}
        />
      </div>

      {/* AI Priority Actions - Full Width */}
      <AIPriorityActions
        leads={analytics?.priorityLeads || []}
        loading={isLoading}
        onAction={handleLeadAction}
      />

      {/* High Value Analytics - Response Time & Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResponseTimeMetrics
          metrics={analytics?.responseMetrics || {
            avgFirstContactHours: 0,
            avgTimeToQualify: 0,
            avgTimeToConvert: 0,
            leadsWaitingContact: 0,
            leadsOverdue: 0,
          }}
          loading={isLoading}
        />
        <LeadAgingReport
          buckets={analytics?.agingBuckets || []}
          loading={isLoading}
        />
      </div>

      {/* High Value Analytics - Sources & Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeadSourceAnalytics
          sources={analytics?.leadSources || []}
          loading={isLoading}
        />
        <ProductInterestBreakdown
          products={analytics?.productInterests || []}
          loading={isLoading}
        />
      </div>

      {/* Geographic Heat Map - Full Width */}
      <GeographicHeatMap
        locations={analytics?.locationData || []}
        loading={isLoading}
      />

      {/* Bottom Row - 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SalesLeaderboard
          salespeople={analytics?.leaderboard || []}
          loading={isLoading}
          showRevenue={false}
        />
        <RecentActivity
          activities={analytics?.recentActivity || []}
          loading={isLoading}
          maxItems={6}
        />
        <UpcomingTasks
          tasks={analytics?.upcomingTasks || []}
          loading={isLoading}
          onComplete={handleTaskComplete}
        />
      </div>
    </div>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function FireIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
