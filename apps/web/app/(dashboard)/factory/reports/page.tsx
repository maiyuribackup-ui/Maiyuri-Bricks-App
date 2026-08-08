"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmt, getFactory, WeekPicker } from "@/components/factory/shared";
import { factoryWeekStart, toISODate } from "@/lib/factory";

type PvaRow = {
  date: string;
  product_code: string;
  planned: number;
  actual: number | null;
  variance: number | null;
  achievement_pct: number | null;
  plan_note: string | null;
  downtime_reason: string | null;
};
type Pva = {
  week_start: string;
  week_end: string;
  rows: PvaRow[];
  totals: { planned: number; actual: number; variance: number; achievement_pct: number | null };
};
type Downtime = {
  causes: { reason: string; entries: number; days_affected: number; days_lost: number; remarks: string[] }[];
};
type Cement = {
  weekly: { week_start: string; product_code: string; bricks_per_bag: number | null; includes_estimates: boolean }[];
};
type Friday = {
  production: { product_code: string; planned: number; actual: number; variance: number; achievement_pct: number | null }[];
  deliveries: { committed_qty: number; delivered_qty: number; variance: number; postponed_count: number };
  downtime: { date: string; product_code: string; reason: string; remarks: string | null }[];
};

const CHART_COLORS: Record<string, string> = {
  "MIB-8": "#2563eb",
  "MIB-6": "#0891b2",
  "CIB-8": "#d97706",
  "CIB-6": "#dc2626",
};

// Views 4 (plan vs actual), 5 (downtime ranked), 6 (cement trend) + the
// Friday review block (committed vs actual vs variance).
export default function FactoryReportsPage() {
  const [week, setWeek] = useState(toISODate(new Date()));
  const ws = factoryWeekStart(week);

  const pva = useQuery({
    queryKey: ["factory", "pva", ws],
    queryFn: () => getFactory<Pva>(`reports/plan-vs-actual?week=${ws}`),
  });
  const friday = useQuery({
    queryKey: ["factory", "friday", ws],
    queryFn: () => getFactory<Friday>(`reports/friday-review?week=${ws}`),
  });
  const downtime = useQuery({
    queryKey: ["factory", "downtime"],
    queryFn: () => getFactory<Downtime>("reports/downtime"),
  });
  const cement = useQuery({
    queryKey: ["factory", "cement"],
    queryFn: () => getFactory<Cement>("reports/cement"),
  });

  // Pivot weekly cement rows into one point per week with a key per product
  const cementSeries = (() => {
    const byWeek = new Map<string, Record<string, number | string | boolean>>();
    for (const w of cement.data?.weekly ?? []) {
      const point = byWeek.get(w.week_start) ?? { week: w.week_start.slice(5) };
      if (w.bricks_per_bag != null) point[w.product_code] = w.bricks_per_bag;
      byWeek.set(w.week_start, point);
    }
    return [...byWeek.values()];
  })();
  const cementProducts = [...new Set((cement.data?.weekly ?? []).map((w) => w.product_code))];

  return (
    <div className="space-y-6">
      <WeekPicker week={week} onChange={setWeek} />

      {/* -------------------------------------------------- Friday review */}
      <section className="rounded-2xl border-2 border-slate-900 bg-white p-4 dark:border-white dark:bg-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          📋 Friday review — committed vs actual
        </h2>
        {friday.data ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Production</h3>
              <table className="w-full text-sm">
                <tbody>
                  {friday.data.production.map((p) => (
                    <tr key={p.product_code} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                      <td className="py-1.5 font-semibold">{p.product_code}</td>
                      <td className="py-1.5 text-right">{fmt(p.planned)} planned</td>
                      <td className="py-1.5 text-right">{fmt(p.actual)} actual</td>
                      <td
                        className={`py-1.5 text-right font-semibold ${
                          p.variance < 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {p.variance >= 0 ? "+" : ""}
                        {fmt(p.variance)}
                      </td>
                      <td className="py-1.5 text-right text-slate-400">
                        {p.achievement_pct != null ? `${p.achievement_pct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-slate-400">Deliveries</h3>
              <p className="text-sm">
                Committed <b>{fmt(friday.data.deliveries.committed_qty)}</b> · Delivered{" "}
                <b>{fmt(friday.data.deliveries.delivered_qty)}</b> ·{" "}
                <span className={friday.data.deliveries.variance < 0 ? "text-red-600" : "text-emerald-600"}>
                  {friday.data.deliveries.variance >= 0 ? "+" : ""}
                  {fmt(friday.data.deliveries.variance)}
                </span>
                {friday.data.deliveries.postponed_count > 0
                  ? ` · ${friday.data.deliveries.postponed_count} postponed`
                  : ""}
              </p>
              {friday.data.downtime.length > 0 ? (
                <>
                  <h3 className="pt-1 text-xs font-semibold uppercase text-slate-400">
                    Downtime this week
                  </h3>
                  <ul className="space-y-0.5 text-xs text-slate-500">
                    {friday.data.downtime.map((d, i) => (
                      <li key={i}>
                        {d.date.slice(5)} {d.product_code}: <b>{d.reason}</b>
                        {d.remarks ? ` — ${d.remarks}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">{friday.isLoading ? "Loading…" : "No data."}</p>
        )}
      </section>

      {/* --------------------------------------------------- plan vs actual */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Plan vs actual — daily
        </h2>
        {pva.data && pva.data.rows.length > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3 text-right">Planned</th>
                  <th className="py-2 pr-3 text-right">Actual</th>
                  <th className="py-2 pr-3 text-right">Variance</th>
                  <th className="py-2 pr-3 text-right">Achieved</th>
                  <th className="py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {pva.data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                    <td className="py-1.5 pr-3 text-xs text-slate-400">{r.date}</td>
                    <td className="py-1.5 pr-3 font-semibold">{r.product_code}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(r.planned)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.actual == null ? "—" : fmt(r.actual)}</td>
                    <td
                      className={`py-1.5 pr-3 text-right font-medium ${
                        (r.variance ?? 0) < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {r.variance == null ? "—" : `${r.variance >= 0 ? "+" : ""}${fmt(r.variance)}`}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {r.achievement_pct == null ? "—" : `${r.achievement_pct}%`}
                    </td>
                    <td className="py-1.5 text-xs text-slate-400">
                      {r.downtime_reason ? `⚠️ ${r.downtime_reason} · ` : ""}
                      {r.plan_note ?? ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={2} className="py-2 pr-3">
                    Week total
                  </td>
                  <td className="py-2 pr-3 text-right">{fmt(pva.data.totals.planned)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(pva.data.totals.actual)}</td>
                  <td
                    className={`py-2 pr-3 text-right ${
                      pva.data.totals.variance < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {pva.data.totals.variance >= 0 ? "+" : ""}
                    {fmt(pva.data.totals.variance)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {pva.data.totals.achievement_pct != null ? `${pva.data.totals.achievement_pct}%` : "—"}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            {pva.isLoading ? "Loading…" : "No plan rows for this week."}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------ downtime ranked */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Downtime by cause — all time
          </h2>
          <div className="mt-2 space-y-2">
            {(downtime.data?.causes ?? []).map((c) => (
              <div key={c.reason} className="rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{c.reason}</span>
                  <span className="text-xs text-slate-400">
                    {c.days_lost} day{c.days_lost === 1 ? "" : "s"} lost · {c.days_affected} affected ·{" "}
                    {c.entries} entr{c.entries === 1 ? "y" : "ies"}
                  </span>
                </div>
                {c.remarks.length > 0 ? (
                  <p className="mt-1 truncate text-xs text-slate-400">{c.remarks[0]}</p>
                ) : null}
              </div>
            ))}
            {downtime.data && downtime.data.causes.length === 0 ? (
              <p className="text-sm text-slate-400">No downtime recorded 🎉</p>
            ) : null}
          </div>
        </section>

        {/* -------------------------------------------------- cement trend */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Cement efficiency — bricks per bag (weekly)
          </h2>
          {cementSeries.length > 0 ? (
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cementSeries}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="week" fontSize={11} />
                  <YAxis domain={["auto", "auto"]} fontSize={11} />
                  <Tooltip />
                  <Legend />
                  {cementProducts.map((code) => (
                    <Line
                      key={code}
                      type="monotone"
                      dataKey={code}
                      stroke={CHART_COLORS[code] ?? "#64748b"}
                      strokeWidth={2}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              {cement.isLoading ? "Loading…" : "No cement data yet."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
