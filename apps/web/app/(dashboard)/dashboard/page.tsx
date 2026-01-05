'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner } from '@maiyuri/ui';
import Link from 'next/link';

interface AIInsight {
  id: string;
  leadId: string;
  leadName: string;
  type: 'follow_up' | 'hot_lead' | 'at_risk' | 'recommendation';
  message: string;
  priority: 'high' | 'medium' | 'low';
  aiScore?: number;
}

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

async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch('/api/dashboard/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  const json = await res.json();
  return json.data || {
    totalLeads: 0,
    hotLeads: 0,
    dueToday: 0,
    converted: 0,
    newLeads: 0,
    followUp: 0,
    cold: 0,
    lost: 0,
  };
}

async function fetchRecentLeads() {
  const res = await fetch('/api/leads?limit=5');
  if (!res.ok) throw new Error('Failed to fetch leads');
  const json = await res.json();
  return json.data || [];
}

async function fetchAIInsights(): Promise<AIInsight[]> {
  // Fetch leads that need attention based on AI analysis
  const res = await fetch('/api/leads?limit=10');
  if (!res.ok) return [];
  const json = await res.json();
  const leads = json.data || [];

  // Generate insights from leads
  const insights: AIInsight[] = [];

  leads.forEach((lead: any) => {
    // Hot leads that need follow-up
    if (lead.status === 'hot' && lead.ai_score && lead.ai_score >= 0.7) {
      insights.push({
        id: `hot-${lead.id}`,
        leadId: lead.id,
        leadName: lead.name,
        type: 'hot_lead',
        message: `High conversion probability (${Math.round(lead.ai_score * 100)}%). Prioritize this lead.`,
        priority: 'high',
        aiScore: lead.ai_score,
      });
    }

    // Follow-up due
    if (lead.follow_up_date) {
      const followUpDate = new Date(lead.follow_up_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      followUpDate.setHours(0, 0, 0, 0);

      if (followUpDate <= today && lead.status !== 'converted' && lead.status !== 'lost') {
        insights.push({
          id: `followup-${lead.id}`,
          leadId: lead.id,
          leadName: lead.name,
          type: 'follow_up',
          message: `Follow-up ${followUpDate < today ? 'overdue' : 'due today'}. ${lead.next_action || 'Contact the lead.'}`,
          priority: followUpDate < today ? 'high' : 'medium',
          aiScore: lead.ai_score,
        });
      }
    }

    // At-risk leads (low score, not cold/lost)
    if (lead.ai_score && lead.ai_score < 0.3 && lead.status !== 'cold' && lead.status !== 'lost') {
      insights.push({
        id: `risk-${lead.id}`,
        leadId: lead.id,
        leadName: lead.name,
        type: 'at_risk',
        message: `Low conversion probability (${Math.round(lead.ai_score * 100)}%). Consider re-engagement strategy.`,
        priority: 'medium',
        aiScore: lead.ai_score,
      });
    }
  });

  // Sort by priority and limit to 5
  return insights
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 5);
}

const statusLabels: Record<string, string> = {
  new: 'New',
  follow_up: 'Follow Up',
  hot: 'Hot',
  cold: 'Cold',
  converted: 'Converted',
  lost: 'Lost',
};

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchStats,
  });

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ['recentLeads'],
    queryFn: fetchRecentLeads,
  });

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['aiInsights'],
    queryFn: fetchAIInsights,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Welcome back! Here&apos;s your lead overview.
          </p>
        </div>
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <PlusIcon className="h-5 w-5" />
          New Lead
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value={statsLoading ? '-' : stats?.totalLeads || 0}
          icon={UsersIcon}
        />
        <StatCard
          title="Hot Leads"
          value={statsLoading ? '-' : stats?.hotLeads || 0}
          icon={FireIcon}
          color="red"
        />
        <StatCard
          title="Due Today"
          value={statsLoading ? '-' : stats?.dueToday || 0}
          icon={ClockIcon}
          color="yellow"
        />
        <StatCard
          title="Converted"
          value={statsLoading ? '-' : stats?.converted || 0}
          icon={CheckIcon}
          color="green"
        />
      </div>

      {/* AI Insights */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              AI Insights
            </h2>
          </div>
          <Link
            href="/coaching"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            View coaching
          </Link>
        </div>

        {insightsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : insights && insights.length > 0 ? (
          <div className="space-y-3">
            {insights.map((insight) => (
              <Link
                key={insight.id}
                href={`/leads/${insight.leadId}`}
                className="block p-4 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <InsightIcon type={insight.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {insight.leadName}
                      </span>
                      <Badge
                        variant={
                          insight.priority === 'high' ? 'danger' :
                          insight.priority === 'medium' ? 'warning' : 'default'
                        }
                      >
                        {insight.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {insight.message}
                    </p>
                  </div>
                  {insight.aiScore !== undefined && (
                    <div className="text-right shrink-0">
                      <span className={`text-lg font-bold ${
                        insight.aiScore >= 0.7 ? 'text-green-600' :
                        insight.aiScore >= 0.4 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {Math.round(insight.aiScore * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <SparklesIcon className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              No AI insights yet. Start adding leads and analyzing them to see recommendations.
            </p>
          </div>
        )}
      </Card>

      {/* Recent Leads */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Recent Leads
          </h2>
          <Link
            href="/leads"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            View all
          </Link>
        </div>

        {leadsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : leads?.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 dark:text-slate-400">
              No leads yet. Create your first lead to get started.
            </p>
            <Link
              href="/leads/new"
              className="mt-4 inline-flex items-center gap-x-2 text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              <PlusIcon className="h-4 w-4" />
              Create Lead
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead>
                <tr>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-white">
                    Name
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-white">
                    Contact
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-white">
                    Status
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-white">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {leads?.map((lead: any) => (
                  <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="whitespace-nowrap px-3 py-4">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-slate-900 dark:text-white hover:text-blue-600"
                      >
                        {lead.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {lead.contact}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4">
                      <Badge
                        variant={
                          lead.status === 'hot' ? 'danger' :
                          lead.status === 'converted' ? 'success' :
                          lead.status === 'follow_up' ? 'warning' : 'default'
                        }
                      >
                        {statusLabels[lead.status] || lead.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {lead.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'red' | 'yellow' | 'green';
}) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4">
        <div className={`rounded-lg p-2.5 ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </Card>
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function InsightIcon({ type }: { type: 'follow_up' | 'hot_lead' | 'at_risk' | 'recommendation' }) {
  const icons = {
    follow_up: (
      <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
        <ClockIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      </div>
    ),
    hot_lead: (
      <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
        <FireIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
      </div>
    ),
    at_risk: (
      <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
        <ExclamationIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      </div>
    ),
    recommendation: (
      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <LightbulbIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
    ),
  };
  return icons[type] || icons.recommendation;
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}
