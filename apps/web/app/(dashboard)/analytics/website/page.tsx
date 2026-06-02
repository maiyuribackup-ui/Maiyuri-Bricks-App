"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Select } from "@maiyuri/ui";
import { HelpButton } from "@/components/help";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface WebsiteAnalytics {
  configured: boolean;
  reason?: string;
  rangeDays?: number;
  totals?: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    engagementRate: number;
  };
  timeseries?: { date: string; users: number }[];
  channels?: { channel: string; sessions: number; share: number }[];
  topPages?: { path: string; title: string; views: number }[];
  keyEvents?: { event: string; count: number }[];
}

const EVENT_LABELS: Record<string, string> = {
  whatsapp_click: "WhatsApp clicks",
  call_click: "Call clicks",
  cost_calculator_started: "Calculator started",
  cost_calculator_completed: "Calculator completed",
  brochure_downloaded: "Brochure downloads",
  factory_visit_cta_clicked: "Factory-visit CTA",
  google_map_clicked: "Map clicks",
  quote_request_submitted: "Quote requests",
};

const COLORS = ["#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#22c55e", "#06b6d4"];

const periodOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "28", label: "Last 28 days" },
  { value: "90", label: "Last 90 days" },
];

async function fetchWebsiteAnalytics(days: string): Promise<WebsiteAnalytics> {
  const res = await fetch(`/api/analytics/website?days=${days}`);
  if (!res.ok) throw new Error("Failed to load website analytics");
  const json = await res.json();
  return json.data;
}

export default function WebsiteBehaviourPage() {
  const [period, setPeriod] = useState("28");
  const { data, isLoading } = useQuery({
    queryKey: ["website-analytics", period],
    queryFn: () => fetchWebsiteAnalytics(period),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            🌐 Website Behaviour
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            How visitors find and engage with maiyuri.com (from Google Analytics).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HelpButton section="website-analytics" variant="icon" />
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-36"
          />
        </div>
      </div>

      {/* Not-connected setup state */}
      {!isLoading && data && data.configured === false && (
        <Card className="p-8 text-center">
          <div className="text-4xl">🔌</div>
          <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
            Google Analytics isn&apos;t connected yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {data.reason ??
              "Add the GA4 property id and service-account credentials to switch this page on."}
          </p>
          <p className="mx-auto mt-4 max-w-md text-xs text-slate-400">
            Once connected, you&apos;ll see visitors, traffic channels, top
            pages, and high-intent events (WhatsApp clicks, calculator,
            brochure downloads).
          </p>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </Card>
          ))}
        </div>
      )}

      {/* Connected dashboard */}
      {!isLoading && data?.configured && data.totals && (
        <>
          {/* KPI band */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Visitors" value={data.totals.activeUsers.toLocaleString("en-IN")} tone="text-blue-600 dark:text-blue-400" />
            <Kpi label="Sessions" value={data.totals.sessions.toLocaleString("en-IN")} tone="text-slate-900 dark:text-slate-100" />
            <Kpi label="Page views" value={data.totals.pageViews.toLocaleString("en-IN")} tone="text-slate-900 dark:text-slate-100" />
            <Kpi label="Engagement" value={`${Math.round(data.totals.engagementRate * 100)}%`} tone="text-emerald-600 dark:text-emerald-400" />
          </div>

          {/* Traffic + channels */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                Visitors over time
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.timeseries ?? []}>
                    <defs>
                      <linearGradient id="gaUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="url(#gaUsers)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                Traffic channels
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(data.channels ?? []).map((c) => ({ name: c.channel, value: c.sessions }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {(data.channels ?? []).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Top pages + key events */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                Top pages
              </h3>
              <div className="space-y-2">
                {(data.topPages ?? []).map((p) => (
                  <div key={p.path} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {p.title || p.path}
                      </p>
                      <p className="truncate text-xs text-slate-400">{p.path}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {p.views.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
                {(data.topPages ?? []).length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">No page data.</p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
                High-intent events
              </h3>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Actions that signal buying intent.
              </p>
              <div className="space-y-2">
                {(data.keyEvents ?? []).map((e) => (
                  <div key={e.event} className="flex items-center justify-between rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {EVENT_LABELS[e.event] ?? e.event}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {e.count.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
                {(data.keyEvents ?? []).length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No tracked events yet — these appear once GA4 is configured
                    to send them from the site.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </Card>
  );
}
