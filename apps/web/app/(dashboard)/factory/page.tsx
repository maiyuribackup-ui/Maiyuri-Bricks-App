"use client";

import { useQuery } from "@tanstack/react-query";
import { fmt, getFactory, useStock } from "@/components/factory/shared";
import { productMeta, toISODate, type FactoryProductCode } from "@/lib/factory";

type PlanVsActual = {
  week_start: string;
  week_end: string;
  totals: {
    planned: number;
    actual: number;
    variance: number;
    achievement_pct: number | null;
  };
};

// Overview: live stock (View 1) with free_stock as the hero number, plus a
// this-week plan-vs-actual strip.
export default function FactoryOverviewPage() {
  const stock = useStock();
  const pva = useQuery({
    queryKey: ["factory", "pva", "current"],
    queryFn: () =>
      getFactory<PlanVsActual>(`reports/plan-vs-actual?week=${toISODate(new Date())}`),
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Live stock by product
        </h2>
        {stock.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(stock.data ?? []).map((p) => {
              const meta = productMeta(p.code as FactoryProductCode);
              const negative = p.free_stock < 0;
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-slate-900 dark:text-white">
                      {p.code}
                    </span>
                    <span className="text-xs text-slate-400">
                      {meta.type} · {meta.size}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-3xl font-bold ${
                      negative ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {fmt(p.free_stock)}
                  </p>
                  <p className="text-xs text-slate-400">free stock (promisable)</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                    <dt>Opening</dt>
                    <dd className="text-right">
                      {p.opening_counted_at ? fmt(p.opening_stock) : "not counted"}
                    </dd>
                    <dt>Produced</dt>
                    <dd className="text-right">{fmt(p.produced)}</dd>
                    <dt>Delivered</dt>
                    <dd className="text-right">{fmt(p.delivered)}</dd>
                    <dt>Committed</dt>
                    <dd className="text-right">{fmt(p.committed)}</dd>
                    <dt>Balance</dt>
                    <dd className={`text-right font-semibold ${p.stock_balance < 0 ? "text-red-600" : ""}`}>
                      {fmt(p.stock_balance)}
                    </dd>
                    <dt>Bricks/bag</dt>
                    <dd className="text-right">{p.bricks_per_bag ?? "—"}</dd>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          This week — plan vs actual
        </h2>
        {pva.data ? (
          <div className="mt-2 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {fmt(pva.data.totals.actual)}
                <span className="text-sm font-normal text-slate-400">
                  {" "}/ {fmt(pva.data.totals.planned)} planned
                </span>
              </p>
              <p className="text-xs text-slate-400">
                {pva.data.week_start} → {pva.data.week_end}
              </p>
            </div>
            <p
              className={`text-lg font-semibold ${
                (pva.data.totals.variance ?? 0) < 0 ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {pva.data.totals.variance >= 0 ? "+" : ""}
              {fmt(pva.data.totals.variance)} variance
            </p>
            {pva.data.totals.achievement_pct != null ? (
              <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                {pva.data.totals.achievement_pct}% achieved
              </p>
            ) : null}
            <a href="/factory/reports" className="ml-auto text-sm font-medium text-blue-600 underline">
              Full reports →
            </a>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            {pva.isLoading ? "Loading…" : "No plan rows for the current week."}
          </p>
        )}
      </section>
    </div>
  );
}
