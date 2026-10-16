"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmt, getFactory, sendFactory, WeekPicker } from "@/components/factory/shared";
import { factoryWeekStart, toISODate, WORK_TYPES } from "@/lib/factory";

type LabourWeek = {
  week_start: string;
  week_end: string;
  entries: {
    id: string;
    work_date: string;
    worker: string;
    work_type: string;
    qty: number;
    rate: number;
    notes: string | null;
  }[];
  workers: { worker: string; gross: number; advances: number; net: number; entries: number }[];
  totals: { gross: number; advances: number; net: number };
};

const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// View 7: weekly labour — gross, advances, net payable. Advance entries are
// qty 1 × negative rate so a plain sum nets out automatically.
export default function FactoryLabourPage() {
  const queryClient = useQueryClient();
  const [week, setWeek] = useState(toISODate(new Date()));
  const ws = factoryWeekStart(week);

  const data = useQuery({
    queryKey: ["factory", "labour-week", ws],
    queryFn: () => getFactory<LabourWeek>(`reports/labour-week?week=${ws}`),
  });

  const [form, setForm] = useState({
    work_date: new Date().toISOString().slice(0, 10),
    worker: "",
    work_type: "Loading",
    qty: "",
    rate: "",
    notes: "",
  });
  const isAdvance = form.work_type === "Advance";

  const create = useMutation({
    mutationFn: () =>
      sendFactory("labour", "POST", {
        ...form,
        qty: isAdvance ? 1 : Number(form.qty),
        rate: isAdvance ? -Math.abs(Number(form.rate)) : Number(form.rate),
        notes: form.notes || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["factory"] });
      setForm((f) => ({ ...f, qty: "", rate: "", notes: "" }));
    },
  });

  const input =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

  return (
    <div className="space-y-4">
      <WeekPicker week={week} onChange={setWeek} />

      {/* entry form */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-6 dark:border-slate-700 dark:bg-slate-800">
        <input
          type="date"
          value={form.work_date}
          onChange={(e) => setForm({ ...form, work_date: e.target.value })}
          className={input}
        />
        <input
          placeholder="Worker"
          value={form.worker}
          onChange={(e) => setForm({ ...form, worker: e.target.value })}
          className={input}
        />
        <select
          value={form.work_type}
          onChange={(e) => setForm({ ...form, work_type: e.target.value })}
          className={input}
        >
          {WORK_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {!isAdvance ? (
          <input
            type="number"
            placeholder="Qty (bricks/days)"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
            className={input}
          />
        ) : (
          <span className="flex items-center px-2 text-xs text-slate-400">qty = 1</span>
        )}
        <input
          type="number"
          placeholder={isAdvance ? "Advance amount ₹" : "Rate ₹"}
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: e.target.value })}
          className={input}
        />
        <input
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className={input}
        />
        <div className="col-span-2 flex items-center gap-3 lg:col-span-6">
          <button
            onClick={() => create.mutate()}
            disabled={
              create.isPending || !form.worker || !form.rate || (!isAdvance && !form.qty)
            }
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {create.isPending ? "Saving…" : isAdvance ? "Record advance" : "Save entry"}
          </button>
          {create.isError ? (
            <p className="text-sm text-red-600">
              {create.error instanceof Error ? create.error.message : "Failed"}
            </p>
          ) : null}
        </div>
      </div>

      {/* weekly summary */}
      {data.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs uppercase text-slate-400">Gross earned</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {inr(data.data.totals.gross)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs uppercase text-slate-400">Advances</p>
              <p className="text-2xl font-bold text-amber-600">
                −{inr(data.data.totals.advances)}
              </p>
            </div>
            <div className="rounded-2xl border-2 border-slate-900 bg-white p-4 dark:border-white dark:bg-slate-800">
              <p className="text-xs uppercase text-slate-400">Net payable</p>
              <p className="text-2xl font-bold text-emerald-600">{inr(data.data.totals.net)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-3 py-3 text-right">Gross</th>
                  <th className="px-3 py-3 text-right">Advances</th>
                  <th className="px-3 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.data.workers.map((w) => (
                  <tr key={w.worker} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                    <td className="px-4 py-2.5 font-medium">{w.worker}</td>
                    <td className="px-3 py-2.5 text-right">{inr(w.gross)}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600">
                      {w.advances !== 0 ? `−${inr(w.advances)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{inr(w.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase text-slate-400">Entries this week</h3>
            {data.data.entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="w-20 shrink-0 text-xs text-slate-400">{e.work_date}</span>
                <span className="w-32 shrink-0 font-medium">{e.worker}</span>
                <span className="w-28 shrink-0 text-xs text-slate-500">{e.work_type}</span>
                <span className="w-24 shrink-0 text-right text-xs text-slate-400">
                  {fmt(e.qty)} × {e.rate}
                </span>
                <span
                  className={`w-24 shrink-0 text-right font-semibold ${
                    e.qty * e.rate < 0 ? "text-amber-600" : ""
                  }`}
                >
                  {e.qty * e.rate < 0 ? "−" : ""}
                  {inr(e.qty * e.rate)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{e.notes}</span>
              </div>
            ))}
            {data.data.entries.length === 0 ? (
              <p className="text-sm text-slate-400">No entries this week.</p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="py-6 text-center text-slate-400">{data.isLoading ? "Loading…" : "No data."}</p>
      )}
    </div>
  );
}
