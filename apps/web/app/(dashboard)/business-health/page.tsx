"use client";

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/dashboard";
import { HelpButton } from "@/components/help";
import { Card } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import { useState } from "react";

// Brand colors
const brand = {
  primary: "#1F6F43",
  secondary: "#8B5E3C",
  accent: "#2F80ED",
};

interface BusinessHealthData {
  production: {
    today: number;
    target: number;
    mtd: number;
    trend: Array<{ date: string; count: number }>;
  };
  revenue: {
    mtd: number;
    target: number;
    recentPayments: Array<{ amount: number; date: string; leadName: string }>;
  };
  leads: {
    active: number;
    conversionRate: number;
    todayCalls: number;
    pendingFollowUps: number;
    pipeline: Array<{ status: string; count: number }>;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    leadName: string;
    description: string;
    timestamp: string;
    sentiment?: string;
    conversionScore?: number;
  }>;
}

async function fetchBusinessHealth(): Promise<BusinessHealthData> {
  const res = await fetch("/api/business-health");
  if (!res.ok) throw new Error("Failed to fetch business health data");
  const json = await res.json();
  return json.data;
}

const sentimentColors: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-stone-100 text-stone-600",
  negative: "bg-red-100 text-red-600",
};

const pipelineLabels: Record<string, string> = {
  new: "New",
  follow_up: "Follow Up",
  hot: "Hot",
  cold: "Cold",
  converted: "Won",
  lost: "Lost",
};

const pipelineColors: Record<string, string> = {
  new: "bg-blue-500",
  follow_up: "bg-cyan-500",
  hot: "bg-orange-500",
  cold: "bg-stone-400",
  converted: "bg-emerald-600",
  lost: "bg-red-400",
};

export default function BusinessHealthPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["business-health"],
    queryFn: fetchBusinessHealth,
    refetchInterval: 60000, // Auto-refresh every minute
  });

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Failed to load business health data.</p>
        <p className="text-sm text-stone-500 mt-2">Check Supabase connection.</p>
      </div>
    );
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Business Health</h1>
          <p className="text-sm text-stone-500 mt-1">{dateStr}</p>
        </div>
        <HelpButton section="business-health" variant="icon" />
      </div>

      {/* KPI Row — Production & Profit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Production */}
        <KPICard
          title="Today's Production"
          value={data?.production.today ?? 0}
          suffix=" bricks"
          change={data?.production.today != null && data.production.today >= data.production.target ? 5 : -5}
          changeLabel={`target: ${data?.production.target ?? 800}`}
          icon={<BrickIcon />}
          loading={isLoading}
          variant="default"
        />

        {/* MTD Profit */}
        <KPICard
          title="MTD Revenue"
          prefix="₹"
          value={data?.revenue.mtd.toLocaleString("en-IN") ?? "0"}
          change={
            data?.revenue.mtd != null && data.revenue.target > 0
              ? Math.round((data.revenue.mtd / data.revenue.target) * 100 - 100)
              : undefined
          }
          changeLabel={`target: ₹${(data?.revenue.target ?? 150000).toLocaleString("en-IN")}`}
          icon={<RupeeIcon />}
          loading={isLoading}
          variant={data?.revenue.mtd != null && data.revenue.mtd >= data.revenue.target * 0.5 ? "success" : "warning"}
        />

        {/* Active Leads */}
        <KPICard
          title="Active Leads"
          value={data?.leads.active ?? 0}
          change={data?.leads.conversionRate}
          changeLabel="% conversion"
          icon={<LeadsIcon />}
          loading={isLoading}
          variant="primary"
        />

        {/* Calls & Follow-ups */}
        <KPICard
          title="Today's Calls"
          value={data?.leads.todayCalls ?? 0}
          change={-(data?.leads.pendingFollowUps ?? 0)}
          changeLabel={`${data?.leads.pendingFollowUps ?? 0} pending`}
          icon={<CallIcon />}
          loading={isLoading}
          variant={data?.leads.pendingFollowUps != null && data.leads.pendingFollowUps <= 5 ? "success" : "warning"}
        />
      </div>

      {/* Production + Pipeline Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-Day Production Trend */}
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-4">
            7-Day Production
          </h3>
          <div className="space-y-2">
            {data?.production.trend.map((day) => {
              const pct = Math.min((day.count / 1000) * 100, 100);
              const isAboveTarget = day.count >= 800;
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-stone-500 w-10">{day.date}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={cn(
                        "h-3 rounded-full transition-all",
                        isAboveTarget ? "bg-emerald-500" : "bg-amber-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-16 text-right">
                    {day.count}
                  </span>
                  {isAboveTarget ? (
                    <span className="text-xs text-emerald-600">✓</span>
                  ) : (
                    <span className="text-xs text-amber-600">{800 - day.count} short</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <div className="flex justify-between text-xs">
              <span className="text-stone-500">MTD Total</span>
              <span className="font-semibold text-stone-800">
                {data?.production.mtd.toLocaleString("en-IN")} bricks
              </span>
            </div>
          </div>
        </Card>

        {/* Pipeline Funnel */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-4">
            Lead Pipeline
          </h3>
          <div className="space-y-2.5">
            {data?.leads.pipeline.map((stage) => {
              const max = Math.max(...data.leads.pipeline.map((s) => s.count), 1);
              const pct = (stage.count / max) * 100;
              return (
                <div key={stage.status}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-stone-600">
                      {pipelineLabels[stage.status] || stage.status}
                    </span>
                    <span className="text-stone-500 font-medium">{stage.count}</span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-1.5">
                    <div
                      className={cn("h-1.5 rounded-full", pipelineColors[stage.status] || "bg-stone-400")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Activity + Revenue Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-4">
            Recent Activity
          </h3>
          {!data?.recentActivity.length && (
            <p className="text-sm text-stone-400 py-4 text-center">No recent activity</p>
          )}
          <div className="space-y-3">
            {data?.recentActivity.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div
                  className={cn(
                    "w-2 h-2 mt-2 rounded-full flex-shrink-0",
                    item.type === "call" ? "bg-amber-500" : "bg-blue-500"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-800 truncate">
                      {item.leadName}
                    </span>
                    {item.sentiment && (
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full font-medium",
                          sentimentColors[item.sentiment] || "bg-stone-100 text-stone-600"
                        )}
                      >
                        {item.sentiment}
                      </span>
                    )}
                    {item.conversionScore != null && (
                      <span
                        className={cn(
                          "text-xs font-bold",
                          item.conversionScore >= 70
                            ? "text-emerald-600"
                            : item.conversionScore >= 40
                            ? "text-amber-600"
                            : "text-red-500"
                        )}
                      >
                        {item.conversionScore}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 truncate mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Payments */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-4">
            Recent Payments
          </h3>
          {!data?.revenue.recentPayments.length && (
            <p className="text-sm text-stone-400 py-4 text-center">No payments this month</p>
          )}
          <div className="space-y-3">
            {data?.revenue.recentPayments.map((payment, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">
                    {payment.leadName}
                  </p>
                  <p className="text-xs text-stone-400">
                    {new Date(payment.date).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <span className="text-sm font-semibold text-emerald-700 flex-shrink-0">
                  ₹{payment.amount.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>

          {/* Profit to Target */}
          <div className="mt-4 pt-4 border-t border-stone-100">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-stone-500">Target</span>
              <span className="font-bold text-amber-700">
                ₹{(data?.revenue.target ?? 150000).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Gap</span>
              <span
                className={cn(
                  "font-medium",
                  (data?.revenue.mtd ?? 0) < (data?.revenue.target ?? 150000)
                    ? "text-red-500"
                    : "text-emerald-600"
                )}
              >
                ₹{Math.max(0, (data?.revenue.target ?? 150000) - (data?.revenue.mtd ?? 0)).toLocaleString(
                  "en-IN"
                )}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 w-full bg-stone-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.min(
                    ((data?.revenue.mtd ?? 0) / (data?.revenue.target ?? 150000)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-stone-400 mt-1">
              {Math.round(((data?.revenue.mtd ?? 0) / (data?.revenue.target ?? 150000)) * 100)}% of
              monthly target
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// --- SVG Icons ---
function BrickIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="4" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function RupeeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5h6M9 9h6M12 5v14M9 17l3-3 3 3" />
    </svg>
  );
}

function LeadsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}
