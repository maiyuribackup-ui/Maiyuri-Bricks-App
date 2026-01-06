'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@maiyuri/ui';

// Types
interface KPIFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  currentValue: number;
  targetValue?: number;
  description: string;
}

interface LeadKPIScore {
  leadId: string;
  leadName: string;
  status: string;
  value: number;
  trend: 'up' | 'stable' | 'down';
  confidence: number;
  factors: KPIFactor[];
  daysSinceLastContact: number;
  recommendation: string;
  urgency: 'high' | 'medium' | 'low';
}

interface StaffKPIScore {
  staffId: string;
  staffName: string;
  value: number;
  trend: 'up' | 'stable' | 'down';
  confidence: number;
  factors: KPIFactor[];
  leadsHandled: number;
  conversionRate: number;
  avgResponseTime: number;
  strengths: string[];
  improvements: string[];
}

interface BusinessKPIScore {
  value: number;
  trend: 'up' | 'stable' | 'down';
  confidence: number;
  factors: KPIFactor[];
  pipelineValue: number;
  conversionVelocity: number;
  leadFlow: {
    newLeads: number;
    convertedLeads: number;
    lostLeads: number;
    netChange: number;
  };
  teamEfficiency: number;
}

interface KPIAlert {
  id: string;
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  entityType: 'lead' | 'staff' | 'business';
  entityId?: string;
  entityName?: string;
  message: string;
  recommendation?: string;
}

interface KPIDashboard {
  leadScores: {
    scores: LeadKPIScore[];
    averageScore: number;
    topPerformers: LeadKPIScore[];
    needsAttention: LeadKPIScore[];
  };
  staffScores: {
    scores: StaffKPIScore[];
    teamAverageScore: number;
    topPerformers: StaffKPIScore[];
    coachingNeeded: StaffKPIScore[];
  };
  businessScore: {
    score: BusinessKPIScore;
    insights: string[];
  };
  alerts: KPIAlert[];
  recommendations: string[];
  generatedAt: string;
}

type ViewType = 'overview' | 'leads' | 'staff' | 'business';

export default function KPIPage() {
  return (
    <Suspense fallback={<KPILoadingFallback />}>
      <KPIContent />
    </Suspense>
  );
}

function KPILoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-96">
      <div className="text-center">
        <LoadingSpinner className="h-8 w-8 mx-auto text-blue-600" />
        <p className="mt-4 text-slate-500 dark:text-slate-400">Loading KPI dashboard...</p>
      </div>
    </div>
  );
}

function KPIContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<KPIDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activeView = (searchParams.get('view') as ViewType) || 'overview';

  const setActiveView = useCallback((view: ViewType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'overview') {
      params.delete('view');
    } else {
      params.set('view', view);
    }
    router.push(`/kpi?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/kpi/dashboard');
      const data = await response.json();

      if (data.data && !data.error) {
        setDashboard(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch KPI dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading) {
    return <KPILoadingFallback />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            KPI Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            AI-powered performance metrics and insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dashboard?.generatedAt && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Updated: {new Date(dashboard.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <RefreshIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2 flex-wrap">
        {(['overview', 'leads', 'staff', 'business'] as ViewType[]).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={cn(
              'px-4 py-2 rounded-lg font-medium text-sm capitalize',
              activeView === view
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
            )}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Alerts Banner */}
      {dashboard?.alerts && dashboard.alerts.length > 0 && activeView === 'overview' && (
        <AlertsBanner alerts={dashboard.alerts} />
      )}

      {/* Overview View */}
      {activeView === 'overview' && dashboard && (
        <OverviewView dashboard={dashboard} />
      )}

      {/* Leads View */}
      {activeView === 'leads' && dashboard && (
        <LeadsView leadScores={dashboard.leadScores} />
      )}

      {/* Staff View */}
      {activeView === 'staff' && dashboard && (
        <StaffView staffScores={dashboard.staffScores} />
      )}

      {/* Business View */}
      {activeView === 'business' && dashboard && (
        <BusinessView businessScore={dashboard.businessScore} />
      )}
    </div>
  );
}

// Overview View Component
function OverviewView({ dashboard }: { dashboard: KPIDashboard }) {
  return (
    <div className="space-y-6">
      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ScoreCard
          title="Business Health"
          score={dashboard.businessScore.score.value}
          trend={dashboard.businessScore.score.trend}
          subtitle={`${dashboard.businessScore.score.leadFlow.netChange >= 0 ? '+' : ''}${dashboard.businessScore.score.leadFlow.netChange} net leads`}
          icon={<ChartIcon className="h-6 w-6" />}
          color="blue"
        />
        <ScoreCard
          title="Lead Pipeline"
          score={dashboard.leadScores.averageScore}
          trend="stable"
          subtitle={`${dashboard.leadScores.scores.length} active leads`}
          icon={<UsersIcon className="h-6 w-6" />}
          color="green"
        />
        <ScoreCard
          title="Team Performance"
          score={dashboard.staffScores.teamAverageScore}
          trend="stable"
          subtitle={`${dashboard.staffScores.scores.length} team members`}
          icon={<TrophyIcon className="h-6 w-6" />}
          color="purple"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Conversion Rate"
          value={`${dashboard.businessScore.score.conversionVelocity}%`}
          icon={<TrendUpIcon className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="New Leads"
          value={dashboard.businessScore.score.leadFlow.newLeads.toString()}
          icon={<PlusIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Converted"
          value={dashboard.businessScore.score.leadFlow.convertedLeads.toString()}
          icon={<CheckIcon className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="Needs Attention"
          value={dashboard.leadScores.needsAttention.length.toString()}
          icon={<AlertIcon className="h-5 w-5 text-orange-500" />}
        />
      </div>

      {/* Recommendations */}
      {dashboard.recommendations.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-blue-500" />
            AI Recommendations
          </h3>
          <ul className="space-y-3">
            {dashboard.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  {idx + 1}
                </span>
                <span className="text-slate-700 dark:text-slate-300">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Performers & Needs Attention Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Leads */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-yellow-500" />
            Top Performing Leads
          </h3>
          <div className="space-y-3">
            {dashboard.leadScores.topPerformers.slice(0, 3).map((lead) => (
              <div key={lead.leadId} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{lead.leadName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{lead.status}</p>
                </div>
                <ScoreBadge score={lead.value} size="sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Needs Attention */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertIcon className="h-5 w-5 text-orange-500" />
            Leads Needing Attention
          </h3>
          <div className="space-y-3">
            {dashboard.leadScores.needsAttention.slice(0, 3).map((lead) => (
              <div key={lead.leadId} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{lead.leadName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{lead.recommendation}</p>
                </div>
                <ScoreBadge score={lead.value} size="sm" />
              </div>
            ))}
            {dashboard.leadScores.needsAttention.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">All leads are performing well!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Leads View Component
function LeadsView({ leadScores }: { leadScores: KPIDashboard['leadScores'] }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Average Score"
          value={leadScores.averageScore.toString()}
          icon={<ChartIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Total Leads"
          value={leadScores.scores.length.toString()}
          icon={<UsersIcon className="h-5 w-5 text-slate-500" />}
        />
        <StatCard
          label="Top Performers"
          value={leadScores.topPerformers.length.toString()}
          icon={<TrophyIcon className="h-5 w-5 text-yellow-500" />}
        />
        <StatCard
          label="Needs Attention"
          value={leadScores.needsAttention.length.toString()}
          icon={<AlertIcon className="h-5 w-5 text-orange-500" />}
        />
      </div>

      {/* Leads Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lead</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Urgency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {leadScores.scores.map((lead) => (
                <tr key={lead.leadId} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-medium text-slate-900 dark:text-white">{lead.leadName}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ScoreBadge score={lead.value} size="sm" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {lead.daysSinceLastContact} days ago
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <UrgencyBadge urgency={lead.urgency} />
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {lead.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Staff View Component
function StaffView({ staffScores }: { staffScores: KPIDashboard['staffScores'] }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Team Average"
          value={staffScores.teamAverageScore.toString()}
          icon={<ChartIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Team Size"
          value={staffScores.scores.length.toString()}
          icon={<UsersIcon className="h-5 w-5 text-slate-500" />}
        />
        <StatCard
          label="Top Performers"
          value={staffScores.topPerformers.length.toString()}
          icon={<TrophyIcon className="h-5 w-5 text-yellow-500" />}
        />
        <StatCard
          label="Needs Coaching"
          value={staffScores.coachingNeeded.length.toString()}
          icon={<AlertIcon className="h-5 w-5 text-orange-500" />}
        />
      </div>

      {/* Staff Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staffScores.scores.map((staff) => (
          <div key={staff.staffId} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">{staff.staffName}</h3>
              <ScoreBadge score={staff.value} size="lg" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Leads Handled</span>
                <p className="font-medium text-slate-900 dark:text-white">{staff.leadsHandled}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Conversion</span>
                <p className="font-medium text-slate-900 dark:text-white">{Math.round(staff.conversionRate * 100)}%</p>
              </div>
            </div>

            {staff.strengths.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-medium text-green-600 dark:text-green-400">Strengths</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {staff.strengths.slice(0, 2).map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {staff.improvements.length > 0 && (
              <div>
                <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Improvements</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {staff.improvements.slice(0, 2).map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Business View Component
function BusinessView({ businessScore }: { businessScore: KPIDashboard['businessScore'] }) {
  const score = businessScore.score;

  return (
    <div className="space-y-6">
      {/* Main Score Card */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Business Health Score</h2>
            <p className="text-slate-500 dark:text-slate-400">Overall performance indicator</p>
          </div>
          <ScoreBadge score={score.value} size="xl" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Pipeline Value</span>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{score.pipelineValue.toFixed(1)}</p>
          </div>
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Conversion Rate</span>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{score.conversionVelocity}%</p>
          </div>
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Team Efficiency</span>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{score.teamEfficiency}</p>
          </div>
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Confidence</span>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{Math.round(score.confidence * 100)}%</p>
          </div>
        </div>
      </div>

      {/* Lead Flow */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="New Leads"
          value={score.leadFlow.newLeads.toString()}
          icon={<PlusIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Converted"
          value={score.leadFlow.convertedLeads.toString()}
          icon={<CheckIcon className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="Lost"
          value={score.leadFlow.lostLeads.toString()}
          icon={<XIcon className="h-5 w-5 text-red-500" />}
        />
        <StatCard
          label="Net Change"
          value={`${score.leadFlow.netChange >= 0 ? '+' : ''}${score.leadFlow.netChange}`}
          icon={<TrendIcon direction={score.leadFlow.netChange >= 0 ? 'up' : 'down'} className="h-5 w-5" />}
        />
      </div>

      {/* Factors */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Score Factors</h3>
        <div className="space-y-4">
          {score.factors.map((factor, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ImpactIndicator impact={factor.impact} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{factor.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{factor.description}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium text-slate-900 dark:text-white">{factor.currentValue}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Weight: {Math.round(factor.weight * 100)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      {businessScore.insights.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-green-500" />
            Business Insights
          </h3>
          <ul className="space-y-2">
            {businessScore.insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <CheckIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Alerts Banner Component
function AlertsBanner({ alerts }: { alerts: KPIAlert[] }) {
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  if (criticalAlerts.length === 0 && warningAlerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {criticalAlerts.map((alert) => (
        <div key={alert.id} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">{alert.message}</p>
            {alert.recommendation && (
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">{alert.recommendation}</p>
            )}
          </div>
        </div>
      ))}
      {warningAlerts.slice(0, 3).map((alert) => (
        <div key={alert.id} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertIcon className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">{alert.message}</p>
            {alert.recommendation && (
              <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">{alert.recommendation}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Score Card Component
function ScoreCard({
  title,
  score,
  trend,
  subtitle,
  icon,
  color,
}: {
  title: string;
  score: number;
  trend: 'up' | 'stable' | 'down';
  subtitle: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple';
}) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className={cn('rounded-lg p-6 text-white bg-gradient-to-br', colorClasses[color])}>
      <div className="flex items-center justify-between mb-4">
        <span className="opacity-80">{icon}</span>
        <TrendIndicator trend={trend} />
      </div>
      <p className="text-sm opacity-80">{title}</p>
      <p className="text-4xl font-bold mt-1">{score}</p>
      <p className="text-sm opacity-80 mt-2">{subtitle}</p>
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 dark:text-slate-400 text-sm">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

// Score Badge Component
function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' | 'xl' }) {
  const getColor = (s: number) => {
    if (s >= 70) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    if (s >= 40) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
  };

  const sizeClasses = {
    sm: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold', getColor(score), sizeClasses[size])}>
      {score}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    follow_up: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    cold: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
    converted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    lost: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded', colors[status] || colors.new)}>
      {status.replace('_', ' ')}
    </span>
  );
}

// Urgency Badge Component
function UrgencyBadge({ urgency }: { urgency: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded', colors[urgency])}>
      {urgency}
    </span>
  );
}

// Trend Indicator Component
function TrendIndicator({ trend }: { trend: 'up' | 'stable' | 'down' }) {
  if (trend === 'up') {
    return <TrendUpIcon className="h-5 w-5 opacity-80" />;
  }
  if (trend === 'down') {
    return <TrendDownIcon className="h-5 w-5 opacity-80" />;
  }
  return <span className="h-5 w-5 opacity-80">—</span>;
}

// Impact Indicator Component
function ImpactIndicator({ impact }: { impact: 'positive' | 'negative' | 'neutral' }) {
  const colors = {
    positive: 'bg-green-500',
    negative: 'bg-red-500',
    neutral: 'bg-slate-400',
  };

  return <span className={cn('w-2 h-2 rounded-full', colors[impact])} />;
}

// Icon Components
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  );
}

function TrendIcon({ direction, className }: { direction: 'up' | 'down' | 'stable'; className?: string }) {
  if (direction === 'up') {
    return <TrendUpIcon className={className} />;
  }
  if (direction === 'down') {
    return <TrendDownIcon className={className} />;
  }
  return <span className={cn(className, 'text-slate-400')}>—</span>;
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={cn(className, 'text-green-500')} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }) {
  return (
    <svg className={cn(className, 'text-red-500')} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
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

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
