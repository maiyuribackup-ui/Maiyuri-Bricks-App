"use client";

import { Card } from "@maiyuri/ui";

interface Recommendation {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tone: "critical" | "warning" | "info" | "success";
}

interface RecommendationCardsProps {
  recommendations: Recommendation[];
  loading?: boolean;
}

const TONE: Record<
  Recommendation["tone"],
  { ring: string; bg: string; text: string }
> = {
  critical: {
    ring: "ring-rose-200 dark:ring-rose-900/40",
    bg: "bg-rose-50 dark:bg-rose-900/20",
    text: "text-rose-700 dark:text-rose-300",
  },
  warning: {
    ring: "ring-amber-200 dark:ring-amber-900/40",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-300",
  },
  info: {
    ring: "ring-blue-200 dark:ring-blue-900/40",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-300",
  },
  success: {
    ring: "ring-emerald-200 dark:ring-emerald-900/40",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-700 dark:text-emerald-300",
  },
};

export function RecommendationCards({
  recommendations,
  loading = false,
}: RecommendationCardsProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
        💡 What To Do Next
      </h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Actions ranked from your live pipeline.
      </p>

      {recommendations.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Pipeline is under control — nothing urgent right now. ✅
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {recommendations.map((r) => {
            const t = TONE[r.tone];
            return (
              <div
                key={r.id}
                className={`flex gap-3 rounded-xl p-3 ring-1 ${t.bg} ${t.ring}`}
              >
                <span className="text-xl">{r.icon}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${t.text}`}>{r.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {r.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default RecommendationCards;
