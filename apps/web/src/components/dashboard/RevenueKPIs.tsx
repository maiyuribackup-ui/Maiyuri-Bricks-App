"use client";

import { Card } from "@maiyuri/ui";

interface RevenueKpis {
  revenueWon: number;
  pipelineValue: number;
  avgOrderValue: number;
  leadToOrderRate: number;
  quoteToOrderRate: number;
}

interface RevenueKPIsProps {
  revenue: RevenueKpis;
  loading?: boolean;
}

const inr = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
};

export function RevenueKPIs({ revenue, loading = false }: RevenueKPIsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Revenue won", value: inr(revenue.revenueWon), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Pipeline value", value: inr(revenue.pipelineValue), tone: "text-blue-600 dark:text-blue-400" },
    { label: "Avg order value", value: inr(revenue.avgOrderValue), tone: "text-slate-900 dark:text-slate-100" },
    { label: "Lead → order", value: `${revenue.leadToOrderRate}%`, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Quote → order", value: `${revenue.quoteToOrderRate}%`, tone: "text-purple-600 dark:text-purple-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {c.label}
          </p>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${c.tone}`}>
            {c.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

export default RevenueKPIs;
