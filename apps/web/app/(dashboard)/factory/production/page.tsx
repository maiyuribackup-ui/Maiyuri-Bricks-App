"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataFlagBadge, fmt, getFactory, sendFactory } from "@/components/factory/shared";
import { DOWNTIME_REASONS } from "@/lib/factory";

type Product = { id: string; code: string };
type LogRow = {
  id: string;
  log_date: string;
  qty_produced: number;
  cement_bags: number | null;
  downtime_reason: string;
  remarks: string | null;
  data_flag: string;
  factory_products: { code: string } | null;
};
type PlanRow = {
  id: string;
  plan_date: string;
  planned_qty: number;
  plan_note: string | null;
  factory_products: { code: string } | null;
};

// Daily production entry: log (one row per date+product — resubmitting the
// same pair edits it) and forward plan, side by side.
export default function FactoryProductionPage() {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["factory", "products"],
    queryFn: () => getFactory<Product[]>("products"),
  });
  const log = useQuery({
    queryKey: ["factory", "production-log"],
    queryFn: () => getFactory<LogRow[]>("production-log"),
  });
  const plan = useQuery({
    queryKey: ["factory", "production-plan"],
    queryFn: () => getFactory<PlanRow[]>("production-plan"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const [logForm, setLogForm] = useState({
    log_date: today,
    product_id: "",
    qty_produced: "",
    cement_bags: "",
    downtime_reason: "None",
    remarks: "",
  });
  const [planForm, setPlanForm] = useState({
    plan_date: today,
    product_id: "",
    planned_qty: "",
    plan_note: "",
  });

  const saveLog = useMutation({
    mutationFn: () =>
      sendFactory("production-log", "POST", {
        ...logForm,
        qty_produced: Number(logForm.qty_produced),
        cement_bags: logForm.cement_bags === "" ? null : Number(logForm.cement_bags),
        remarks: logForm.remarks || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["factory"] });
      setLogForm((f) => ({ ...f, qty_produced: "", cement_bags: "", remarks: "" }));
    },
  });
  const savePlan = useMutation({
    mutationFn: () =>
      sendFactory("production-plan", "POST", {
        ...planForm,
        planned_qty: Number(planForm.planned_qty),
        plan_note: planForm.plan_note || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["factory"] });
      setPlanForm((f) => ({ ...f, planned_qty: "", plan_note: "" }));
    },
  });

  const input =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* ------------------------------------------------ production log */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Production log <span className="font-normal">(actuals — one row per day & product)</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-3 dark:border-slate-700 dark:bg-slate-800">
          <input
            type="date"
            value={logForm.log_date}
            onChange={(e) => setLogForm({ ...logForm, log_date: e.target.value })}
            className={input}
          />
          <select
            value={logForm.product_id}
            onChange={(e) => setLogForm({ ...logForm, product_id: e.target.value })}
            className={input}
          >
            <option value="">Product…</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Qty produced"
            value={logForm.qty_produced}
            onChange={(e) => setLogForm({ ...logForm, qty_produced: e.target.value })}
            className={input}
          />
          <input
            type="number"
            min={0}
            step={0.1}
            placeholder="Cement bags"
            value={logForm.cement_bags}
            onChange={(e) => setLogForm({ ...logForm, cement_bags: e.target.value })}
            className={input}
          />
          <select
            value={logForm.downtime_reason}
            onChange={(e) => setLogForm({ ...logForm, downtime_reason: e.target.value })}
            className={input}
          >
            {DOWNTIME_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input
            placeholder="Remarks"
            value={logForm.remarks}
            onChange={(e) => setLogForm({ ...logForm, remarks: e.target.value })}
            className={input}
          />
          <div className="col-span-2 flex items-center gap-3 lg:col-span-3">
            <button
              onClick={() => saveLog.mutate()}
              disabled={saveLog.isPending || !logForm.product_id || logForm.qty_produced === ""}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saveLog.isPending ? "Saving…" : "Save day"}
            </button>
            {saveLog.isError ? (
              <p className="text-sm text-red-600">
                {saveLog.error instanceof Error ? saveLog.error.message : "Failed"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
          {(log.data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="w-20 shrink-0 text-xs text-slate-400">{r.log_date}</span>
              <span className="w-14 shrink-0 font-semibold">{r.factory_products?.code}</span>
              <span className="w-16 shrink-0 text-right font-medium">{fmt(r.qty_produced)}</span>
              <span className="w-16 shrink-0 text-right text-xs text-slate-400">
                {r.cement_bags != null ? `${r.cement_bags} bags` : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                {r.downtime_reason !== "None" ? `⚠️ ${r.downtime_reason}` : ""}
                {r.remarks ? ` ${r.remarks}` : ""}
              </span>
              <DataFlagBadge flag={r.data_flag} />
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ production plan */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Production plan <span className="font-normal">(targets — actuals come from the log)</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-800">
          <input
            type="date"
            value={planForm.plan_date}
            onChange={(e) => setPlanForm({ ...planForm, plan_date: e.target.value })}
            className={input}
          />
          <select
            value={planForm.product_id}
            onChange={(e) => setPlanForm({ ...planForm, product_id: e.target.value })}
            className={input}
          >
            <option value="">Product…</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Planned qty"
            value={planForm.planned_qty}
            onChange={(e) => setPlanForm({ ...planForm, planned_qty: e.target.value })}
            className={input}
          />
          <input
            placeholder="Note"
            value={planForm.plan_note}
            onChange={(e) => setPlanForm({ ...planForm, plan_note: e.target.value })}
            className={input}
          />
          <div className="col-span-2 flex items-center gap-3 lg:col-span-4">
            <button
              onClick={() => savePlan.mutate()}
              disabled={savePlan.isPending || !planForm.product_id || planForm.planned_qty === ""}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {savePlan.isPending ? "Saving…" : "Save plan row"}
            </button>
            {savePlan.isError ? (
              <p className="text-sm text-red-600">
                {savePlan.error instanceof Error ? savePlan.error.message : "Failed"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
          {(plan.data ?? [])
            .slice()
            .reverse()
            .map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="w-20 shrink-0 text-xs text-slate-400">{r.plan_date}</span>
                <span className="w-14 shrink-0 font-semibold">{r.factory_products?.code}</span>
                <span className="w-16 shrink-0 text-right font-medium">{fmt(r.planned_qty)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                  {r.plan_note ?? ""}
                </span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
