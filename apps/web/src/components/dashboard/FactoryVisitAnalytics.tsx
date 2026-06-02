"use client";

import { Card } from "@maiyuri/ui";

interface FactoryVisitStats {
  invited: number;
  scheduled: number;
  visited: number;
  noShow: number;
  notRequired: number;
  attendanceRate: number;
  visitToOrderRate: number;
  postVisitLostRate: number;
  avgDaysVisitToWon: number | null;
  wonAfterVisit: number;
  lostAfterVisit: number;
}

interface FactoryVisitAnalyticsProps {
  stats: FactoryVisitStats;
  loading?: boolean;
}

export function FactoryVisitAnalytics({
  stats,
  loading = false,
}: FactoryVisitAnalyticsProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="mb-4 h-6 w-44 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </Card>
    );
  }

  const stages = [
    { label: "Invited", value: stats.invited, color: "bg-blue-500" },
    { label: "Scheduled", value: stats.scheduled, color: "bg-cyan-500" },
    { label: "Visited", value: stats.visited, color: "bg-amber-500" },
    { label: "No-show", value: stats.noShow, color: "bg-rose-500" },
  ];
  const maxVal = Math.max(1, ...stages.map((s) => s.value));

  return (
    <Card className="p-6">
      <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
        🏭 Factory Visit Conversion
      </h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        The trust-building step — how visits turn into orders.
      </p>

      {/* Funnel bars */}
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-20 text-xs text-slate-500 dark:text-slate-400">
              {s.label}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full ${s.color}`}
                style={{ width: `${(s.value / maxVal) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Conversion stats */}
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Stat label="Attendance" value={`${stats.attendanceRate}%`} />
        <Stat
          label="Visit → order"
          value={`${stats.visitToOrderRate}%`}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <Stat
          label="Lost after visit"
          value={`${stats.postVisitLostRate}%`}
          tone="text-rose-600 dark:text-rose-400"
        />
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {stats.wonAfterVisit} won · {stats.lostAfterVisit} lost after visiting
        {stats.avgDaysVisitToWon != null
          ? ` · avg ${stats.avgDaysVisitToWon}d visit→win`
          : ""}
      </p>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "text-slate-900 dark:text-slate-100",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

export default FactoryVisitAnalytics;
