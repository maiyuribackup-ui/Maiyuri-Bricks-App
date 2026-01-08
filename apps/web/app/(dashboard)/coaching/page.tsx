'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@maiyuri/ui';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  metrics: {
    leadsHandled: number;
    conversionRate: number;
    avgResponseTime: string;
    activeLeads: number;
  };
  strengths: string[];
  areasForImprovement: string[];
  recommendations: string[];
  performanceScore: number;
}

interface TeamCoaching {
  teamMetrics: {
    totalLeads: number;
    avgConversionRate: number;
    topPerformer: string;
    weeklyTrend: 'up' | 'down' | 'stable';
  };
  teamRecommendations: string[];
  members: TeamMember[];
}

// API response types
interface ApiTeamMetrics {
  leadsHandled: number;
  conversionRate: number;
  averageResponseTime: number;
  followUpCompletionRate: number;
  notesPerLead: number;
  activeLeads: number;
}

interface ApiTopPerformer {
  staffId: string;
  staffName: string;
  score: number;
}

interface ApiImprovementArea {
  area: string;
  description: string;
}

interface ApiTeamCoachingResponse {
  teamMetrics: ApiTeamMetrics;
  topPerformers: ApiTopPerformer[];
  improvementAreas: ApiImprovementArea[];
}

interface ApiIndividualCoaching {
  staffId: string;
  staffName: string;
  period: string;
  metrics: ApiTeamMetrics;
  insights: Array<{
    type: 'strength' | 'improvement' | 'alert';
    title: string;
    description: string;
    metric: string;
    value: number;
  }>;
  recommendations: string[];
  overallScore: number;
}

export default function CoachingPage() {
  return (
    <Suspense fallback={<CoachingLoadingFallback />}>
      <CoachingContent />
    </Suspense>
  );
}

function CoachingLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-96">
      <div className="text-center">
        <LoadingSpinner className="h-8 w-8 mx-auto text-blue-600" />
        <p className="mt-4 text-slate-500 dark:text-slate-400">Loading coaching insights...</p>
      </div>
    </div>
  );
}

function CoachingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [coaching, setCoaching] = useState<TeamCoaching | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Read selected member from URL search params for persistence
  const selectedMember = searchParams.get('member');
  const activeView = searchParams.get('view') === 'individual' ? 'individual' : 'team';

  // Update URL when member is selected
  const setSelectedMember = useCallback((memberId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (memberId) {
      params.set('member', memberId);
      params.set('view', 'individual');
    } else {
      params.delete('member');
    }
    router.push(`/coaching?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Update URL when view changes
  const setActiveView = useCallback((view: 'team' | 'individual') => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'individual') {
      params.set('view', 'individual');
    } else {
      params.delete('view');
      params.delete('member');
    }
    router.push(`/coaching?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const fetchCoaching = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/coaching');
      const result = await response.json();

      // API returns {data: {...}, error: null} format
      if (result.data && !result.error) {
        const apiData = result.data as ApiTeamCoachingResponse;

        // Fetch individual coaching for each top performer to get full member details
        const memberPromises = apiData.topPerformers.map(async (performer) => {
          try {
            const memberResponse = await fetch(`/api/coaching/${performer.staffId}`);
            const memberResult = await memberResponse.json();

            if (memberResult.data && !memberResult.error) {
              const memberData = memberResult.data as ApiIndividualCoaching;
              return {
                id: memberData.staffId,
                name: memberData.staffName,
                role: 'Sales Staff',
                metrics: {
                  leadsHandled: memberData.metrics.leadsHandled,
                  conversionRate: memberData.metrics.conversionRate,
                  avgResponseTime: `${memberData.metrics.averageResponseTime}h`,
                  activeLeads: memberData.metrics.activeLeads,
                },
                strengths: memberData.insights
                  .filter(i => i.type === 'strength')
                  .map(i => i.description),
                areasForImprovement: memberData.insights
                  .filter(i => i.type === 'improvement' || i.type === 'alert')
                  .map(i => i.description),
                recommendations: memberData.recommendations || [],
                performanceScore: memberData.overallScore,
              } as TeamMember;
            }

            // Fallback if individual fetch fails
            return {
              id: performer.staffId,
              name: performer.staffName,
              role: 'Sales Staff',
              metrics: {
                leadsHandled: 0,
                conversionRate: 0,
                avgResponseTime: 'N/A',
                activeLeads: 0,
              },
              strengths: [],
              areasForImprovement: [],
              recommendations: [],
              performanceScore: Math.round(performer.score * 20), // Convert 0-5 score to 0-100
            } as TeamMember;
          } catch {
            return {
              id: performer.staffId,
              name: performer.staffName,
              role: 'Sales Staff',
              metrics: {
                leadsHandled: 0,
                conversionRate: 0,
                avgResponseTime: 'N/A',
                activeLeads: 0,
              },
              strengths: [],
              areasForImprovement: [],
              recommendations: [],
              performanceScore: Math.round(performer.score * 20),
            } as TeamMember;
          }
        });

        const members = await Promise.all(memberPromises);

        // Transform API response to expected interface
        const coaching: TeamCoaching = {
          teamMetrics: {
            totalLeads: apiData.teamMetrics?.leadsHandled || 0,
            avgConversionRate: apiData.teamMetrics?.conversionRate || 0,
            topPerformer: apiData.topPerformers?.[0]?.staffName || 'N/A',
            weeklyTrend: 'stable', // API doesn't provide trend, default to stable
          },
          teamRecommendations: apiData.improvementAreas?.map(area =>
            `${area.area}: ${area.description}`
          ) || [],
          members,
        };

        setCoaching(coaching);
      }
    } catch (err) {
      console.error('Failed to fetch coaching data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoaching();
  }, [fetchCoaching]);

  const selectedMemberData = coaching?.members.find((m) => m.id === selectedMember);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <LoadingSpinner className="h-8 w-8 mx-auto text-blue-600" />
          <p className="mt-4 text-slate-500 dark:text-slate-400">Loading coaching insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Coaching Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            AI-powered performance insights and recommendations
          </p>
        </div>
        <button
          onClick={fetchCoaching}
          className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
        >
          <RefreshIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView('team')}
          className={cn(
            'px-4 py-2 rounded-lg font-medium text-sm',
            activeView === 'team'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
          )}
        >
          Team Overview
        </button>
        <button
          onClick={() => setActiveView('individual')}
          className={cn(
            'px-4 py-2 rounded-lg font-medium text-sm',
            activeView === 'individual'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
          )}
        >
          Individual Coaching
        </button>
      </div>

      {/* Team Overview */}
      {activeView === 'team' && coaching && (
        <div className="space-y-6">
          {/* Team Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Leads"
              value={coaching.teamMetrics.totalLeads.toString()}
              icon={<UsersIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Avg Conversion Rate"
              value={`${coaching.teamMetrics.avgConversionRate}%`}
              icon={<ChartIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Top Performer"
              value={coaching.teamMetrics.topPerformer}
              icon={<TrophyIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Weekly Trend"
              value={coaching.teamMetrics.weeklyTrend}
              icon={<TrendIcon direction={coaching.teamMetrics.weeklyTrend} className="h-5 w-5" />}
              trend={coaching.teamMetrics.weeklyTrend}
            />
          </div>

          {/* Team Recommendations */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Team Recommendations
            </h3>
            <ul className="space-y-3">
              {coaching.teamRecommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <LightbulbIcon className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-300">{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Team Members Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coaching.members.map((member) => (
              <div
                key={member.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => {
                  setSelectedMember(member.id);
                  setActiveView('individual');
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white">{member.name}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{member.role}</p>
                  </div>
                  <PerformanceScore score={member.performanceScore} />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Leads</span>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {member.metrics.leadsHandled}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Conversion</span>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {member.metrics.conversionRate}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Individual Coaching */}
      {activeView === 'individual' && (
        <div className="space-y-6">
          {/* Member Selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Team Member
            </label>
            <select
              value={selectedMember ?? ''}
              onChange={(e) => setSelectedMember(e.target.value || null)}
              className="w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Select a member...</option>
              {coaching?.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} - {member.role}
                </option>
              ))}
            </select>
          </div>

          {selectedMemberData ? (
            <>
              {/* Member Performance Overview */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {selectedMemberData.name}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">{selectedMemberData.role}</p>
                  </div>
                  <PerformanceScore score={selectedMemberData.performanceScore} size="lg" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Leads Handled</span>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedMemberData.metrics.leadsHandled}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Conversion Rate</span>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedMemberData.metrics.conversionRate}%
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Avg Response Time</span>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedMemberData.metrics.avgResponseTime}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Active Leads</span>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedMemberData.metrics.activeLeads}
                    </p>
                  </div>
                </div>
              </div>

              {/* Strengths and Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Strengths
                  </h4>
                  <ul className="space-y-2">
                    {selectedMemberData.strengths.map((strength, idx) => (
                      <li key={idx} className="text-slate-600 dark:text-slate-300 flex items-start gap-2">
                        <span className="text-green-500 mt-1">+</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <ArrowUpIcon className="h-5 w-5 text-orange-500" />
                    Areas for Improvement
                  </h4>
                  <ul className="space-y-2">
                    {selectedMemberData.areasForImprovement.map((area, idx) => (
                      <li key={idx} className="text-slate-600 dark:text-slate-300 flex items-start gap-2">
                        <span className="text-orange-500 mt-1">*</span>
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* AI Recommendations */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
                <h4 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-blue-500" />
                  AI Coaching Recommendations
                </h4>
                <ul className="space-y-3">
                  {selectedMemberData.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <UsersIcon className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                Select a team member
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Choose a team member to view their coaching insights and recommendations.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 dark:text-slate-400 text-sm">{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-bold',
          trend === 'up'
            ? 'text-green-600 dark:text-green-400'
            : trend === 'down'
            ? 'text-red-600 dark:text-red-400'
            : 'text-slate-900 dark:text-white'
        )}
      >
        {value}
      </p>
    </div>
  );
}

// Performance Score Component
function PerformanceScore({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    if (s >= 60) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold',
        getColor(score),
        size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm'
      )}
    >
      {score}
    </div>
  );
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
    return (
      <svg className={cn(className, 'text-green-500')} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    );
  }
  if (direction === 'down') {
    return (
      <svg className={cn(className, 'text-red-500')} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
      </svg>
    );
  }
  return (
    <svg className={cn(className, 'text-slate-400')} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
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

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
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

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
