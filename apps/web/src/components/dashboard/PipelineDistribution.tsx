"use client";

import { Card } from "@maiyuri/ui";

export interface PipelineStageCount {
  key: string;
  label: string;
  emoji: string;
  color: string;
  count: number;
}

interface PipelineDistributionProps {
  stages: PipelineStageCount[];
  title?: string;
  loading?: boolean;
}

export function PipelineDistribution({
  stages,
  title = "Sales Pipeline",
  loading = false,
}: PipelineDistributionProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="mb-4 h-6 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      </Card>
    );
  }

  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const maxCount = stages.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  // Split terminal outcomes out of the "in-progress" bars for a cleaner read.
  const won = stages.find((s) => s.key === "order_won")?.count ?? 0;
  const lost = stages.find((s) => s.key === "closed_lost")?.count ?? 0;
  const openStages = stages.filter(
    (s) => s.key !== "order_won" && s.key !== "closed_lost",
  );
  const openTotal = openStages.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <span className="text-xs text-slate-400">{total} total leads</span>
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Where every lead sits across the eight sales stages right now.
      </p>

      {/* Open-pipeline stage bars */}
      <div className="space-y-2.5">
        {openStages.map((s) => {
          const widthPercent = (s.count / maxCount) * 100;
          const sharePercent =
            openTotal > 0 ? Math.round((s.count / openTotal) * 100) : 0;
          return (
            <div key={s.key} className="group">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span>{s.emoji}</span>
                  {s.label}
                </span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {s.count}
                  </span>{" "}
                  · {sharePercent}%
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out group-hover:brightness-110"
                  style={{
                    width: `${Math.max(widthPercent, s.count > 0 ? 4 : 0)}%`,
                    background: `linear-gradient(90deg, ${s.color}cc, ${s.color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Terminal outcomes */}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            🎉 {won}
          </div>
          <div className="text-xs font-medium text-emerald-700/80 dark:text-emerald-300/80">
            Order Won
          </div>
        </div>
        <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-800/40">
          <div className="text-2xl font-bold text-stone-500 dark:text-stone-400">
            ❌ {lost}
          </div>
          <div className="text-xs font-medium text-stone-600/80 dark:text-stone-400/80">
            Closed Lost
          </div>
        </div>
      </div>
    </Card>
  );
}

export function getDefaultPipelineStages(): PipelineStageCount[] {
  return [];
}
