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
const tabs = ["Overview", "Estimate / BOQ", "WBS", "Daily Progress", "Costs", "AI Insights"] as const;
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
      {tab === "Daily Progress" && <ProgressTab projectId={id} wbs={data.wbsItems} onChanged={() => qc.invalidateQueries({ queryKey: ["project", id] })} />}
      {tab === "Costs" && <CostsTab projectId={id} wbs={data.wbsItems} onChanged={() => qc.invalidateQueries({ queryKey: ["project", id] })} />}
      {tab === "AI Insights" && <InsightsTab projectId={id} />}
    </div>
  );
}

function ProgressTab({ projectId, wbs, onChanged }: { projectId: string; wbs: WbsItem[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const [wbsCode, setWbsCode] = useState("");
  const [qty, setQty] = useState("");
  const [labour, setLabour] = useState("");
  const [machine, setMachine] = useState("");
  const [issue, setIssue] = useState("");
  const [plan, setPlan] = useState("");

  const { data: entries } = useQuery({
    queryKey: ["progress", projectId],
    queryFn: async (): Promise<any[]> => (await (await fetch(`/api/projects/${projectId}/progress`)).json()).data,
  });

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/progress`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wbs_code: wbsCode || null, actual_quantity: qty, labour_count: labour, machine_hours: machine, issue, tomorrow_plan: plan }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => { toast.success("Progress logged"); setQty(""); setLabour(""); setMachine(""); setIssue(""); setPlan(""); qc.invalidateQueries({ queryKey: ["progress", projectId] }); onChanged(); },
    onError: () => toast.error("Save failed"),
  });
  const cls = "w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Log today&apos;s progress</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <select className={cls} value={wbsCode} onChange={(e) => setWbsCode(e.target.value)}>
            <option value="">WBS step…</option>
            {wbs.map((w) => <option key={w.id} value={w.code}>{w.code} {w.name}</option>)}
          </select>
          <input className={cls} type="number" placeholder="Qty done" value={qty} onChange={(e) => setQty(e.target.value)} />
          <input className={cls} type="number" placeholder="Labour" value={labour} onChange={(e) => setLabour(e.target.value)} />
          <input className={cls} type="number" placeholder="Machine hrs" value={machine} onChange={(e) => setMachine(e.target.value)} />
          <input className={cls + " col-span-2"} placeholder="Issue / delay (optional)" value={issue} onChange={(e) => setIssue(e.target.value)} />
          <input className={cls + " col-span-2 sm:col-span-3"} placeholder="Tomorrow's plan" value={plan} onChange={(e) => setPlan(e.target.value)} />
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending || !qty}>{add.isPending ? "Saving…" : "Log progress"}</Button>
      </Card>
      <div className="space-y-2">
        {(entries || []).map((e) => (
          <Card key={e.id} className="p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{e.progress_date} {e.wbs_code ? `· ${e.wbs_code}` : ""}</span>
              <span className="text-[11px] uppercase text-slate-400">{e.source}</span>
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">
              {e.actual_quantity != null && <>Qty {e.actual_quantity} · </>}{e.labour_count != null && <>{e.labour_count} labour · </>}{e.machine_hours != null && <>{e.machine_hours} machine hrs</>}
            </div>
            {e.issue && <div className="mt-1 text-rose-600 dark:text-rose-400">⚠ {e.issue}</div>}
            {e.tomorrow_plan && <div className="mt-1 text-slate-500">→ {e.tomorrow_plan}</div>}
          </Card>
        ))}
        {(entries || []).length === 0 && <p className="py-4 text-center text-sm text-slate-400">No updates yet.</p>}
      </div>
    </div>
  );
}

function CostsTab({ projectId, wbs, onChanged }: { projectId: string; wbs: WbsItem[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const [wbsCode, setWbsCode] = useState("");
  const [cat, setCat] = useState("material");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");

  const { data: entries } = useQuery({
    queryKey: ["costs", projectId],
    queryFn: async (): Promise<any[]> => (await (await fetch(`/api/projects/${projectId}/costs`)).json()).data,
  });

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/costs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wbs_code: wbsCode || null, cost_category: cat, description: desc, amount, vendor }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => { toast.success("Cost recorded"); setDesc(""); setAmount(""); setVendor(""); qc.invalidateQueries({ queryKey: ["costs", projectId] }); onChanged(); },
    onError: () => toast.error("Save failed"),
  });
  const cls = "w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm";
  const cats = ["material","labour","machine","transport","fuel","loading","unloading","subcontract","repair","overhead","miscellaneous"];
  const total = (entries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Record a cost</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <select className={cls} value={wbsCode} onChange={(e) => setWbsCode(e.target.value)}>
            <option value="">WBS (optional)…</option>
            {wbs.map((w) => <option key={w.id} value={w.code}>{w.code} {w.name}</option>)}
          </select>
          <select className={cls} value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className={cls} type="number" placeholder="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className={cls + " col-span-2"} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <input className={cls} placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending || !amount}>{add.isPending ? "Saving…" : "Add cost"}</Button>
      </Card>
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Total recorded</span><span className="tabular-nums">{inr(total)}</span></div>
        <div className="space-y-1.5">
          {(entries || []).map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm dark:border-slate-800">
              <div><span className="font-medium">{inr(e.amount)}</span> <span className="text-xs text-slate-400">{e.cost_category}{e.wbs_code ? ` · ${e.wbs_code}` : ""}{e.vendor ? ` · ${e.vendor}` : ""}</span><div className="text-xs text-slate-500">{e.description}</div></div>
              <span className="text-[11px] uppercase text-slate-400">{e.payment_status}</span>
            </div>
          ))}
          {(entries || []).length === 0 && <p className="py-4 text-center text-sm text-slate-400">No costs yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function InsightsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["insights", projectId],
    queryFn: async () => (await (await fetch(`/api/projects/${projectId}/insights`)).json()).data as { health: string; summary: string; risks: { severity: string; message: string }[]; recommendations: string[]; tomorrowPlan: string | null; source: string },
  });
  if (isLoading) return <Card className="p-6 text-center text-sm text-slate-400">Analysing…</Card>;
  if (!data) return <Card className="p-6 text-center text-sm text-slate-400">No insights.</Card>;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <p className="font-semibold text-slate-900 dark:text-white">Project health</p>
          <span className="text-[10px] uppercase text-slate-400">({data.source})</span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{data.summary}</p>
      </Card>
      <Card className="p-5">
        <p className="mb-2 font-semibold text-slate-900 dark:text-white">⚠️ Risks</p>
        {data.risks.length === 0 ? <p className="text-sm text-emerald-600 dark:text-emerald-400">No active risks. 🎉</p> : (
          <ul className="space-y-1 text-sm">
            {data.risks.map((r, i) => <li key={i} className={r.severity === "high" ? "text-rose-600 dark:text-rose-400" : r.severity === "medium" ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}>• {r.message}</li>)}
          </ul>
        )}
      </Card>
      {data.recommendations.length > 0 && (
        <Card className="p-5">
          <p className="mb-2 font-semibold text-slate-900 dark:text-white">💡 Recommended actions</p>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">{data.recommendations.map((r, i) => <li key={i}>• {r}</li>)}</ul>
          {data.tomorrowPlan && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">Tomorrow: {data.tomorrowPlan}</p>}
        </Card>
      )}
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
