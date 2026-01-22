export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error } from "@/lib/api-utils";

// Types for AI observability stats
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
    recent: Array<{
      id: string;
      alert_type: string;
      threshold_value: number;
      actual_value: number;
      date: string;
      created_at: string;
    }>;
  };
}

// Helper to group and aggregate data
function groupBy<T>(
  array: T[],
  key: keyof T,
  aggregator: (
    items: T[],
  ) => Omit<AgentStats | ModelStats, "agent_type" | "model">,
): (AgentStats | ModelStats)[] {
  const groups = new Map<string, T[]>();

  for (const item of array) {
    const groupKey = String(item[key]);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  }

  return Array.from(groups.entries()).map(([groupKey, items]) => ({
    [key]: groupKey,
    ...aggregator(items),
  })) as (AgentStats | ModelStats)[];
}

// GET /api/observability/stats - Get AI usage statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "7", 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const startDateStr = startDate.toISOString().split("T")[0];

    // Check if tables exist by trying to query them
    const { data: dailyStats, error: dailyError } = await supabaseAdmin
      .from("ai_usage_daily")
      .select("*")
      .gte("date", startDateStr)
      .order("date", { ascending: false });

    // If daily aggregates don't exist or are empty, use real-time query
    if (dailyError || !dailyStats || dailyStats.length === 0) {
      // Try real-time stats from logs table
      const { data: logs, error: logsError } = await supabaseAdmin
        .from("ai_usage_logs")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false });

      if (logsError) {
        // Tables might not exist yet, return empty stats
        console.log(
          "AI observability tables not yet available:",
          logsError.message,
        );
        return success({
          summary: {
            totalCost: 0,
            totalCalls: 0,
            totalTokens: 0,
            avgLatency: 0,
            errorRate: 0,
            periodDays: days,
          },
          byAgent: [],
          byModel: [],
          daily: [],
          alerts: {
            unacknowledged: 0,
            recent: [],
          },
          message:
            "AI observability tables not yet initialized. Run the migration to enable tracking.",
        } as ObservabilityStats & { message: string });
      }

      // Aggregate from raw logs
      const logData = logs ?? [];
      const stats = aggregateFromLogs(logData, days);

      // Get alerts
      const alerts = await getAlerts();

      return success({
        ...stats,
        alerts,
      } as ObservabilityStats);
    }

    // Use pre-aggregated daily stats
    const stats = aggregateFromDaily(dailyStats, days);

    // Get alerts
    const alerts = await getAlerts();

    return success({
      ...stats,
      alerts,
    } as ObservabilityStats);
  } catch (err) {
    console.error("Error fetching AI observability stats:", err);
    return error("Internal server error", 500);
  }
}

// Aggregate stats from raw logs
function aggregateFromLogs(
  logs: Array<{
    agent_type: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    latency_ms: number;
    status: string;
    created_at: string;
  }>,
  periodDays: number,
): Omit<ObservabilityStats, "alerts"> {
  if (logs.length === 0) {
    return {
      summary: {
        totalCost: 0,
        totalCalls: 0,
        totalTokens: 0,
        avgLatency: 0,
        errorRate: 0,
        periodDays,
      },
      byAgent: [],
      byModel: [],
      daily: [],
    };
  }

  const totalCost = logs.reduce((sum, l) => sum + Number(l.cost_usd ?? 0), 0);
  const totalCalls = logs.length;
  const totalTokens = logs.reduce(
    (sum, l) => sum + (l.input_tokens ?? 0) + (l.output_tokens ?? 0),
    0,
  );
  const avgLatency =
    logs.reduce((sum, l) => sum + (l.latency_ms ?? 0), 0) / totalCalls;
  const errorCount = logs.filter((l) => l.status !== "success").length;
  const errorRate = (errorCount / totalCalls) * 100;

  // Group by agent
  const byAgent = groupBy(logs, "agent_type", (items) => {
    const calls = items.length;
    const errors = items.filter((i) => i.status !== "success").length;
    return {
      total_calls: calls,
      total_cost: items.reduce((s, i) => s + Number(i.cost_usd ?? 0), 0),
      total_tokens: items.reduce(
        (s, i) => s + (i.input_tokens ?? 0) + (i.output_tokens ?? 0),
        0,
      ),
      avg_latency_ms:
        items.reduce((s, i) => s + (i.latency_ms ?? 0), 0) / calls,
      error_count: errors,
      success_rate: ((calls - errors) / calls) * 100,
    };
  }) as AgentStats[];

  // Group by model
  const byModel = groupBy(logs, "model", (items) => {
    const calls = items.length;
    return {
      total_calls: calls,
      total_cost: items.reduce((s, i) => s + Number(i.cost_usd ?? 0), 0),
      total_tokens: items.reduce(
        (s, i) => s + (i.input_tokens ?? 0) + (i.output_tokens ?? 0),
        0,
      ),
      avg_latency_ms:
        items.reduce((s, i) => s + (i.latency_ms ?? 0), 0) / calls,
    };
  }) as ModelStats[];

  // Group by day
  const dailyGroups = new Map<string, typeof logs>();
  for (const log of logs) {
    const date = log.created_at.split("T")[0];
    if (!dailyGroups.has(date)) {
      dailyGroups.set(date, []);
    }
    dailyGroups.get(date)!.push(log);
  }

  const daily: DailyStats[] = Array.from(dailyGroups.entries())
    .map(([date, items]) => ({
      date,
      total_calls: items.length,
      total_cost: items.reduce((s, i) => s + Number(i.cost_usd ?? 0), 0),
      total_tokens: items.reduce(
        (s, i) => s + (i.input_tokens ?? 0) + (i.output_tokens ?? 0),
        0,
      ),
      avg_latency_ms:
        items.reduce((s, i) => s + (i.latency_ms ?? 0), 0) / items.length,
      error_count: items.filter((i) => i.status !== "success").length,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: {
      totalCost,
      totalCalls,
      totalTokens,
      avgLatency,
      errorRate,
      periodDays,
    },
    byAgent,
    byModel,
    daily,
  };
}

// Aggregate stats from daily aggregates table
function aggregateFromDaily(
  dailyStats: Array<{
    date: string;
    agent_type: string;
    model: string;
    total_calls: number;
    success_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    avg_latency_ms: number;
    error_count: number;
  }>,
  periodDays: number,
): Omit<ObservabilityStats, "alerts"> {
  if (dailyStats.length === 0) {
    return {
      summary: {
        totalCost: 0,
        totalCalls: 0,
        totalTokens: 0,
        avgLatency: 0,
        errorRate: 0,
        periodDays,
      },
      byAgent: [],
      byModel: [],
      daily: [],
    };
  }

  const totalCost = dailyStats.reduce(
    (sum, d) => sum + Number(d.total_cost_usd ?? 0),
    0,
  );
  const totalCalls = dailyStats.reduce(
    (sum, d) => sum + (d.total_calls ?? 0),
    0,
  );
  const totalTokens = dailyStats.reduce(
    (sum, d) =>
      sum + (d.total_input_tokens ?? 0) + (d.total_output_tokens ?? 0),
    0,
  );
  const avgLatency =
    dailyStats.reduce(
      (sum, d) => sum + (d.avg_latency_ms ?? 0) * (d.total_calls ?? 0),
      0,
    ) / totalCalls;
  const errorCount = dailyStats.reduce(
    (sum, d) => sum + (d.error_count ?? 0),
    0,
  );
  const errorRate = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0;

  // Group by agent
  const agentMap = new Map<
    string,
    {
      total_calls: number;
      total_cost: number;
      total_tokens: number;
      total_latency: number;
      error_count: number;
    }
  >();

  for (const d of dailyStats) {
    const existing = agentMap.get(d.agent_type) ?? {
      total_calls: 0,
      total_cost: 0,
      total_tokens: 0,
      total_latency: 0,
      error_count: 0,
    };
    agentMap.set(d.agent_type, {
      total_calls: existing.total_calls + (d.total_calls ?? 0),
      total_cost: existing.total_cost + Number(d.total_cost_usd ?? 0),
      total_tokens:
        existing.total_tokens +
        (d.total_input_tokens ?? 0) +
        (d.total_output_tokens ?? 0),
      total_latency:
        existing.total_latency + (d.avg_latency_ms ?? 0) * (d.total_calls ?? 0),
      error_count: existing.error_count + (d.error_count ?? 0),
    });
  }

  const byAgent: AgentStats[] = Array.from(agentMap.entries()).map(
    ([agent_type, stats]) => ({
      agent_type,
      total_calls: stats.total_calls,
      total_cost: stats.total_cost,
      total_tokens: stats.total_tokens,
      avg_latency_ms:
        stats.total_calls > 0 ? stats.total_latency / stats.total_calls : 0,
      error_count: stats.error_count,
      success_rate:
        stats.total_calls > 0
          ? ((stats.total_calls - stats.error_count) / stats.total_calls) * 100
          : 100,
    }),
  );

  // Group by model
  const modelMap = new Map<
    string,
    {
      total_calls: number;
      total_cost: number;
      total_tokens: number;
      total_latency: number;
    }
  >();

  for (const d of dailyStats) {
    const existing = modelMap.get(d.model) ?? {
      total_calls: 0,
      total_cost: 0,
      total_tokens: 0,
      total_latency: 0,
    };
    modelMap.set(d.model, {
      total_calls: existing.total_calls + (d.total_calls ?? 0),
      total_cost: existing.total_cost + Number(d.total_cost_usd ?? 0),
      total_tokens:
        existing.total_tokens +
        (d.total_input_tokens ?? 0) +
        (d.total_output_tokens ?? 0),
      total_latency:
        existing.total_latency + (d.avg_latency_ms ?? 0) * (d.total_calls ?? 0),
    });
  }

  const byModel: ModelStats[] = Array.from(modelMap.entries()).map(
    ([model, stats]) => ({
      model,
      total_calls: stats.total_calls,
      total_cost: stats.total_cost,
      total_tokens: stats.total_tokens,
      avg_latency_ms:
        stats.total_calls > 0 ? stats.total_latency / stats.total_calls : 0,
    }),
  );

  // Group by date
  const dateMap = new Map<
    string,
    {
      total_calls: number;
      total_cost: number;
      total_tokens: number;
      total_latency: number;
      error_count: number;
    }
  >();

  for (const d of dailyStats) {
    const existing = dateMap.get(d.date) ?? {
      total_calls: 0,
      total_cost: 0,
      total_tokens: 0,
      total_latency: 0,
      error_count: 0,
    };
    dateMap.set(d.date, {
      total_calls: existing.total_calls + (d.total_calls ?? 0),
      total_cost: existing.total_cost + Number(d.total_cost_usd ?? 0),
      total_tokens:
        existing.total_tokens +
        (d.total_input_tokens ?? 0) +
        (d.total_output_tokens ?? 0),
      total_latency:
        existing.total_latency + (d.avg_latency_ms ?? 0) * (d.total_calls ?? 0),
      error_count: existing.error_count + (d.error_count ?? 0),
    });
  }

  const daily: DailyStats[] = Array.from(dateMap.entries())
    .map(([date, stats]) => ({
      date,
      total_calls: stats.total_calls,
      total_cost: stats.total_cost,
      total_tokens: stats.total_tokens,
      avg_latency_ms:
        stats.total_calls > 0 ? stats.total_latency / stats.total_calls : 0,
      error_count: stats.error_count,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: {
      totalCost,
      totalCalls,
      totalTokens,
      avgLatency,
      errorRate,
      periodDays,
    },
    byAgent,
    byModel,
    daily,
  };
}

// Get cost alerts
async function getAlerts(): Promise<ObservabilityStats["alerts"]> {
  try {
    const { count: unackedCount } = await supabaseAdmin
      .from("ai_cost_alerts")
      .select("id", { count: "exact", head: true })
      .eq("acknowledged", false);

    const { data: recentAlerts } = await supabaseAdmin
      .from("ai_cost_alerts")
      .select("id, alert_type, threshold_value, actual_value, date, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      unacknowledged: unackedCount ?? 0,
      recent: recentAlerts ?? [],
    };
  } catch {
    // Alerts table might not exist yet
    return {
      unacknowledged: 0,
      recent: [],
    };
  }
}
