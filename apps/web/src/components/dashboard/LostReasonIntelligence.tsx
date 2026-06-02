"use client";

import { Card } from "@maiyuri/ui";

interface LostReasonStat {
  code: string;
  label: string;
  count: number;
}

interface LostReasonIntelligenceProps {
  reasons: LostReasonStat[];
  loading?: boolean;
}

const BAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#a855f7",
  "#6366f1",
  "#06b6d4",
  "#64748b",
];

export function LostReasonIntelligence({
  reasons,
  loading = false,
}: LostReasonIntelligenceProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </Card>
    );
  }

  const total = reasons.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          ❌ Why We Lose Deals
        </h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {total} lost
        </span>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No lost deals in this period. 🎉
        </p>
      ) : (
        <div className="space-y-3">
          {reasons.map((r, i) => {
            const pct = Math.round((r.count / total) * 100);
            return (
              <div key={r.code}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    {r.label}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {r.count}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({pct}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default LostReasonIntelligence;
