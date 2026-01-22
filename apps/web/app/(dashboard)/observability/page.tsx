"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@maiyuri/ui";
// HelpButton removed - observability not in ManualSection yet

// Types for observability stats
interface AgentStats {
  agent_type: string;
  total_calls: number;
  total_cost: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
  success_rate: number;
}

interface ModelStats {
  model: string;
  total_calls: number;
  total_cost: number;
  total_tokens: number;
  avg_latency_ms: number;
}

interface DailyStats {
  date: string;
  total_calls: number;
  total_cost: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
}

interface Alert {
  id: string;
  alert_type: string;
  threshold_value: number;
  actual_value: number;
  date: string;
  created_at: string;
}

interface ObservabilityStats {
  summary: {
    totalCost: number;
    totalCalls: number;
    totalTokens: number;
    avgLatency: number;
    errorRate: number;
    periodDays: number;
  };
  byAgent: AgentStats[];
  byModel: ModelStats[];
  daily: DailyStats[];
  alerts: {
    unacknowledged: number;
    recent: Alert[];
  };
  message?: string;
}

type ViewType = "overview" | "agents" | "models" | "trends";

export default function ObservabilityPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ObservabilityContent />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-96">
      <div className="text-center">
        <LoadingSpinner className="h-8 w-8 mx-auto text-blue-600" />
        <p className="mt-4 text-slate-500 dark:text-slate-400">
          Loading AI observability dashboard...
        </p>
      </div>
    </div>
  );
}

function ObservabilityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<ObservabilityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(7);

  const activeView = (searchParams.get("view") as ViewType) || "overview";

  const setActiveView = useCallback(
    (view: ViewType) => {
      const params = new URLSearchParams(searchParams.toString());
      if (view === "overview") {
        params.delete("view");
      } else {
        params.set("view", view);
      }
      router.push(`/observability?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/observability/stats?days=${days}`);
      const data = await response.json();

      if (data.data && !data.error) {
        setStats(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch observability stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return <LoadingFallback />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI Observability
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor LLM costs, performance, and usage across all AI operations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <RefreshIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Warning if tables not initialized */}
      {stats?.message && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertIcon className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              {stats.message}
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
              Run the Supabase migration to enable AI usage tracking.
            </p>
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-2 flex-wrap">
        {(["overview", "agents", "models", "trends"] as ViewType[]).map(
          (view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={cn(
                "px-4 py-2 rounded-lg font-medium text-sm capitalize",
                activeView === view
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600",
              )}
            >
              {view}
            </button>
          ),
        )}
      </div>

      {/* Alerts Banner */}
      {stats?.alerts?.unacknowledged && stats.alerts.unacknowledged > 0 && (
        <AlertsBanner
          alerts={stats.alerts.recent}
          count={stats.alerts.unacknowledged}
        />
      )}

      {/* Overview View */}
      {activeView === "overview" && stats && <OverviewView stats={stats} />}

      {/* Agents View */}
      {activeView === "agents" && stats && (
        <AgentsView agents={stats.byAgent} />
      )}

      {/* Models View */}
      {activeView === "models" && stats && (
        <ModelsView models={stats.byModel} />
      )}

      {/* Trends View */}
      {activeView === "trends" && stats && <TrendsView daily={stats.daily} />}
    </div>
  );
}

// Overview View
function OverviewView({ stats }: { stats: ObservabilityStats }) {
  const summary = stats.summary;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Cost"
          value={`$${summary.totalCost.toFixed(4)}`}
          subtitle={`Last ${summary.periodDays} days`}
          icon={<DollarIcon className="h-6 w-6" />}
          color="green"
        />
        <SummaryCard
          title="API Calls"
          value={summary.totalCalls.toLocaleString()}
          subtitle={`${(summary.totalCalls / summary.periodDays).toFixed(1)}/day avg`}
          icon={<ServerIcon className="h-6 w-6" />}
          color="blue"
        />
        <SummaryCard
          title="Tokens Used"
          value={formatTokens(summary.totalTokens)}
          subtitle={`${formatTokens(summary.totalTokens / summary.periodDays)}/day avg`}
          icon={<TokenIcon className="h-6 w-6" />}
          color="purple"
        />
        <SummaryCard
          title="Avg Latency"
          value={`${summary.avgLatency.toFixed(0)}ms`}
          subtitle={`${summary.errorRate.toFixed(1)}% error rate`}
          icon={<ClockIcon className="h-6 w-6" />}
          color={summary.avgLatency < 2000 ? "green" : "orange"}
        />
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents by Cost */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BrainIcon className="h-5 w-5 text-purple-500" />
            Top Agents by Cost
          </h3>
          <div className="space-y-3">
            {stats.byAgent
              .sort((a, b) => b.total_cost - a.total_cost)
              .slice(0, 5)
              .map((agent) => (
                <div
                  key={agent.agent_type}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {formatAgentName(agent.agent_type)}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {agent.total_calls.toLocaleString()} calls
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900 dark:text-white">
                      ${agent.total_cost.toFixed(4)}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {agent.success_rate.toFixed(1)}% success
                    </p>
                  </div>
                </div>
              ))}
            {stats.byAgent.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No AI usage data yet.
              </p>
            )}
          </div>
        </div>

        {/* Top Models by Usage */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <CpuIcon className="h-5 w-5 text-blue-500" />
            Top Models by Usage
          </h3>
          <div className="space-y-3">
            {stats.byModel
              .sort((a, b) => b.total_calls - a.total_calls)
              .slice(0, 5)
              .map((model) => (
                <div
                  key={model.model}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {formatModelName(model.model)}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {formatTokens(model.total_tokens)} tokens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {model.total_calls.toLocaleString()} calls
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      ${model.total_cost.toFixed(4)}
                    </p>
                  </div>
                </div>
              ))}
            {stats.byModel.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No AI usage data yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Daily Trends (Mini) */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <ChartIcon className="h-5 w-5 text-green-500" />
          Daily Cost Trend
        </h3>
        <div className="flex items-end gap-1 h-32">
          {stats.daily
            .slice(0, 14)
            .reverse()
            .map((day, idx) => {
              const maxCost = Math.max(
                ...stats.daily.map((d) => d.total_cost),
                0.001,
              );
              const height = (day.total_cost / maxCost) * 100;
              return (
                <div key={day.date} className="flex-1 group relative">
                  <div
                    className="bg-green-500 hover:bg-green-600 rounded-t transition-all"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {new Date(day.date).toLocaleDateString()}: $
                    {day.total_cost.toFixed(4)}
                  </div>
                </div>
              );
            })}
          {stats.daily.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 w-full text-center py-8">
              No daily data available yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Agents View
function AgentsView({ agents }: { agents: AgentStats[] }) {
  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Agents"
          value={agents.length.toString()}
          icon={<BrainIcon className="h-5 w-5 text-purple-500" />}
        />
        <StatCard
          label="Total Calls"
          value={agents.reduce((s, a) => s + a.total_calls, 0).toLocaleString()}
          icon={<ServerIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Total Cost"
          value={`$${agents.reduce((s, a) => s + a.total_cost, 0).toFixed(4)}`}
          icon={<DollarIcon className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="Avg Success Rate"
          value={`${(agents.reduce((s, a) => s + a.success_rate, 0) / (agents.length || 1)).toFixed(1)}%`}
          icon={<CheckIcon className="h-5 w-5 text-green-500" />}
        />
      </div>

      {/* Agents Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Calls
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Avg Latency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Success Rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {agents
                .sort((a, b) => b.total_cost - a.total_cost)
                .map((agent) => (
                  <tr
                    key={agent.agent_type}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {formatAgentName(agent.agent_type)}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {agent.total_calls.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatTokens(agent.total_tokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900 dark:text-white">
                      ${agent.total_cost.toFixed(4)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {agent.avg_latency_ms.toFixed(0)}ms
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <SuccessRateBadge rate={agent.success_rate} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {agents.length === 0 && (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              No agent data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Models View
function ModelsView({ models }: { models: ModelStats[] }) {
  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Models"
          value={models.length.toString()}
          icon={<CpuIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Total Calls"
          value={models.reduce((s, m) => s + m.total_calls, 0).toLocaleString()}
          icon={<ServerIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Total Tokens"
          value={formatTokens(models.reduce((s, m) => s + m.total_tokens, 0))}
          icon={<TokenIcon className="h-5 w-5 text-purple-500" />}
        />
        <StatCard
          label="Total Cost"
          value={`$${models.reduce((s, m) => s + m.total_cost, 0).toFixed(4)}`}
          icon={<DollarIcon className="h-5 w-5 text-green-500" />}
        />
      </div>

      {/* Models Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {models
          .sort((a, b) => b.total_cost - a.total_cost)
          .map((model) => (
            <div
              key={model.model}
              className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {formatModelName(model.model)}
                </h3>
                <ModelProviderBadge model={model.model} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    API Calls
                  </span>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {model.total_calls.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Tokens
                  </span>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {formatTokens(model.total_tokens)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Cost
                  </span>
                  <p className="font-medium text-green-600 dark:text-green-400">
                    ${model.total_cost.toFixed(4)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Avg Latency
                  </span>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {model.avg_latency_ms.toFixed(0)}ms
                  </p>
                </div>
              </div>

              {/* Cost per 1K tokens */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Avg cost per 1K tokens
                </span>
                <p className="font-medium text-slate-900 dark:text-white">
                  $
                  {(
                    (model.total_cost / (model.total_tokens || 1)) *
                    1000
                  ).toFixed(6)}
                </p>
              </div>
            </div>
          ))}
        {models.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            No model data available yet.
          </div>
        )}
      </div>
    </div>
  );
}

// Trends View
function TrendsView({ daily }: { daily: DailyStats[] }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Days Tracked"
          value={daily.length.toString()}
          icon={<CalendarIcon className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Peak Calls"
          value={Math.max(
            ...daily.map((d) => d.total_calls),
            0,
          ).toLocaleString()}
          icon={<TrendUpIcon className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="Peak Cost"
          value={`$${Math.max(...daily.map((d) => d.total_cost), 0).toFixed(4)}`}
          icon={<DollarIcon className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="Total Errors"
          value={daily.reduce((s, d) => s + d.error_count, 0).toLocaleString()}
          icon={<AlertIcon className="h-5 w-5 text-red-500" />}
        />
      </div>

      {/* Daily Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Calls
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Avg Latency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Errors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {daily.map((day) => (
                <tr
                  key={day.date}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {new Date(day.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {day.total_calls.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {formatTokens(day.total_tokens)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900 dark:text-white">
                    ${day.total_cost.toFixed(4)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {day.avg_latency_ms.toFixed(0)}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {day.error_count > 0 ? (
                      <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        {day.error_count}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {daily.length === 0 && (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              No daily data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Alerts Banner
function AlertsBanner({ alerts, count }: { alerts: Alert[]; count: number }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <AlertIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
        <div>
          <p className="font-medium text-red-800 dark:text-red-200">
            {count} unacknowledged cost alert{count !== 1 ? "s" : ""}
          </p>
          <p className="text-sm text-red-600 dark:text-red-300 mt-1">
            {alerts
              .slice(0, 2)
              .map((a) => a.alert_type.replace(/_/g, " "))
              .join(", ")}
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: "green" | "blue" | "purple" | "orange";
}) {
  const colorClasses = {
    green: "from-green-500 to-green-600",
    blue: "from-blue-500 to-blue-600",
    purple: "from-purple-500 to-purple-600",
    orange: "from-orange-500 to-orange-600",
  };

  return (
    <div
      className={cn(
        "rounded-lg p-6 text-white bg-gradient-to-br",
        colorClasses[color],
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="text-sm opacity-80">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      <p className="text-sm opacity-80 mt-2">{subtitle}</p>
    </div>
  );
}

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
        <span className="text-slate-500 dark:text-slate-400 text-sm">
          {label}
        </span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function SuccessRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 95
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
      : rate >= 80
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";

  return (
    <span className={cn("px-2 py-1 text-xs font-medium rounded", color)}>
      {rate.toFixed(1)}%
    </span>
  );
}

function ModelProviderBadge({ model }: { model: string }) {
  const provider = model.toLowerCase().includes("claude")
    ? "Anthropic"
    : model.toLowerCase().includes("gemini")
      ? "Google"
      : model.toLowerCase().includes("gpt")
        ? "OpenAI"
        : "Other";

  const colors: Record<string, string> = {
    Anthropic:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    Google: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    OpenAI:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    Other: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  };

  return (
    <span
      className={cn("px-2 py-1 text-xs font-medium rounded", colors[provider])}
    >
      {provider}
    </span>
  );
}

// Helpers
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

function formatAgentName(name: string): string {
  return name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatModelName(name: string): string {
  // Shorten common model names
  if (name.includes("claude-sonnet")) return "Claude Sonnet";
  if (name.includes("claude-opus")) return "Claude Opus";
  if (name.includes("claude-haiku")) return "Claude Haiku";
  if (name.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (name.includes("gemini-2.5-pro")) return "Gemini 2.5 Pro";
  if (name.includes("gpt-4o")) return "GPT-4o";
  if (name.includes("gpt-4")) return "GPT-4";
  return name;
}

// Icons
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z"
      />
    </svg>
  );
}

function TokenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}
