"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Button } from "@maiyuri/ui";
import { toast } from "sonner";
import type { Project, ProjectEstimate, BoqItem, WbsItem } from "@maiyuri/shared";

interface Budget {
  approvedBudget: number;
  actualCost: number;
  forecastCost: number;
  variance: number;
  budgetUsedPct: number;
  progressPct: number;
  forecastMargin: number;
  costHealth: string;
}
interface Bundle {
  project: Project;
  estimate: ProjectEstimate | null;
  boqItems: BoqItem[];
  wbsItems: WbsItem[];
  budget: Budget;
}
interface Warning { type: string; message: string; severity: "low" | "medium" | "high"; }

const inr = (n: number | null | undefined) => (n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const tabs = ["Overview", "Estimate / BOQ", "WBS"] as const;
type Tab = (typeof tabs)[number];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async (): Promise<Bundle> => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data;
    },
  });

  if (isLoading || !data) {
    return <Card className="p-8 text-center text-sm text-slate-400">Loading project…</Card>;
  }
  const { project, budget } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/projects" className="text-xs text-slate-400 hover:underline">← Projects</Link>
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{project.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {project.customer_name || "—"}{project.location ? ` · ${project.location}` : ""} · {project.status.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-amber-500 text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab project={project} budget={budget} />}
      {tab === "Estimate / BOQ" && <EstimateTab projectId={id} onChanged={() => qc.invalidateQueries({ queryKey: ["project", id] })} />}
      {tab === "WBS" && <WbsTab projectId={id} wbs={data.wbsItems} onChanged={() => qc.invalidateQueries({ queryKey: ["project", id] })} />}
    </div>
  );
}

function OverviewTab({ project, budget }: { project: Project; budget: Budget }) {
  const cards = [
    { label: "Approved budget", value: inr(budget.approvedBudget) },
    { label: "Actual cost", value: inr(budget.actualCost) },
    { label: "Forecast cost", value: inr(budget.forecastCost) },
    { label: "Forecast margin", value: inr(budget.forecastMargin), tone: "text-emerald-600 dark:text-emerald-400" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className={`mt-2 text-xl font-bold tabular-nums ${c.tone ?? "text-slate-900 dark:text-slate-100"}`}>{c.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Progress</p>
          <p className="mt-2 text-xl font-bold tabular-nums">{Math.round(budget.progressPct)}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, budget.progressPct)}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Budget used</p>
          <p className="mt-2 text-xl font-bold tabular-nums">{budget.budgetUsedPct}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Cost health</p>
          <p className="mt-2 text-xl font-bold capitalize">{budget.costHealth.replace(/_/g, " ")}</p>
          <p className="mt-1 text-xs text-slate-400">Variance {inr(budget.variance)}</p>
        </Card>
      </div>
      {project.notes && <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">{project.notes}</Card>}
    </div>
  );
}

function EstimateTab({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<BoqItem[] | null>(null);

  const { data } = useQuery({
    queryKey: ["estimate", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/estimate`);
      const json = (await res.json()).data as { estimate: ProjectEstimate | null; boqItems: BoqItem[]; warnings: Warning[] };
      setRows(json.boqItems);
      return json;
    },
  });

  const approved = data?.estimate?.status === "approved";
  const r = rows ?? data?.boqItems ?? [];
  const line = (it: BoqItem) => ({
    cost: (Number(it.quantity) || 0) * (Number(it.cost_rate) || 0),
    rev: (Number(it.quantity) || 0) * (Number(it.selling_rate) || 0),
  });
  const totals = r.reduce((a, it) => { const l = line(it); a.cost += l.cost; a.rev += l.rev; return a; }, { cost: 0, rev: 0 });
  const marginPct = totals.rev > 0 ? ((totals.rev - totals.cost) / totals.rev) * 100 : 0;

  const update = (i: number, patch: Partial<BoqItem>) =>
    setRows((prev) => (prev ?? r).map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: r.map((it) => ({ name: it.name, code: it.code, quantity: it.quantity, unit: it.unit, cost_category: it.cost_category, cost_rate: it.cost_rate, selling_rate: it.selling_rate, linked_wbs_code: it.linked_wbs_code })) }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => { toast.success("Estimate saved"); qc.invalidateQueries({ queryKey: ["estimate", projectId] }); onChanged(); },
    onError: () => toast.error("Save failed"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/estimate`, { method: "POST" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "approve failed"); }
    },
    onSuccess: () => { toast.success("Budget approved — baseline frozen"); qc.invalidateQueries({ queryKey: ["estimate", projectId] }); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const inputCls = "w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm";

  return (
    <div className="space-y-4">
      {data?.warnings && data.warnings.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">⚠️ AI estimate checks</p>
          <ul className="space-y-1 text-sm">
            {data.warnings.map((w, i) => (
              <li key={i} className={w.severity === "high" ? "text-rose-600 dark:text-rose-400" : w.severity === "medium" ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}>• {w.message}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
            <tr>
              <th className="p-2">Item</th><th className="p-2 w-20">Qty</th><th className="p-2 w-24">Cost ₹</th><th className="p-2 w-24">Sell ₹</th><th className="p-2 w-24 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {r.map((it, i) => {
              const l = line(it);
              return (
                <tr key={it.id ?? i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{it.name}</div>
                    <div className="text-[11px] text-slate-400">{it.cost_category}{it.linked_wbs_code ? ` · ${it.linked_wbs_code}` : ""}</div>
                  </td>
                  <td className="p-2"><input disabled={approved} type="number" className={inputCls} value={it.quantity ?? 0} onChange={(e) => update(i, { quantity: Number(e.target.value) })} /></td>
                  <td className="p-2"><input disabled={approved} type="number" className={inputCls} value={it.cost_rate ?? 0} onChange={(e) => update(i, { cost_rate: Number(e.target.value) })} /></td>
                  <td className="p-2"><input disabled={approved} type="number" className={inputCls} value={it.selling_rate ?? 0} onChange={(e) => update(i, { selling_rate: Number(e.target.value) })} /></td>
                  <td className="p-2 text-right tabular-nums font-medium">{inr(l.rev - l.cost)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="p-2">Totals</td><td></td>
              <td className="p-2 tabular-nums">{inr(totals.cost)}</td>
              <td className="p-2 tabular-nums">{inr(totals.rev)}</td>
              <td className="p-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{inr(totals.rev - totals.cost)} ({marginPct.toFixed(0)}%)</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {approved ? (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Baseline approved &amp; frozen. Use a change order to modify.</p>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save estimate"}</Button>
          <Button variant="secondary" onClick={() => approve.mutate()} disabled={approve.isPending}>{approve.isPending ? "Approving…" : "Approve budget (owner)"}</Button>
        </div>
      )}
    </div>
  );
}

function WbsTab({ projectId, wbs, onChanged }: { projectId: string; wbs: WbsItem[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (payload: { wbs_id: string; completed_quantity?: number; planned_quantity?: number; progress_pct?: number; status?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/wbs`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => { toast.success("WBS updated"); qc.invalidateQueries({ queryKey: ["project", projectId] }); onChanged(); },
    onError: () => toast.error("Update failed"),
  });

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
          <tr><th className="p-2">WBS</th><th className="p-2 w-28">Planned</th><th className="p-2 w-28">Completed</th><th className="p-2 w-28">Progress</th><th className="p-2">Status</th></tr>
        </thead>
        <tbody>
          {wbs.map((w) => (
            <WbsRow key={w.id} w={w} onSave={(p) => save.mutate({ wbs_id: w.id, ...p })} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function WbsRow({ w, onSave }: { w: WbsItem; onSave: (p: { completed_quantity?: number; planned_quantity?: number; status?: string }) => void }) {
  const [completed, setCompleted] = useState(String(w.completed_quantity ?? 0));
  const [planned, setPlanned] = useState(String(w.planned_quantity ?? 0));
  const inputCls = "w-24 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm";
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="p-2"><span className="text-[11px] text-slate-400">{w.code}</span><div className="font-medium text-slate-800 dark:text-slate-200">{w.name}</div></td>
      <td className="p-2"><input type="number" className={inputCls} value={planned} onChange={(e) => setPlanned(e.target.value)} onBlur={() => onSave({ planned_quantity: Number(planned), completed_quantity: Number(completed) })} /></td>
      <td className="p-2"><input type="number" className={inputCls} value={completed} onChange={(e) => setCompleted(e.target.value)} onBlur={() => onSave({ planned_quantity: Number(planned), completed_quantity: Number(completed) })} /></td>
      <td className="p-2 tabular-nums">{Math.round(w.progress_pct)}%</td>
      <td className="p-2">
        <select className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm" value={w.status} onChange={(e) => onSave({ status: e.target.value })}>
          {["not_started","in_progress","blocked","at_risk","delayed","completed","cancelled"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </td>
    </tr>
  );
}
