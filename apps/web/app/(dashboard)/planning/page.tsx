"use client";

/**
 * Ops Planning — web view. The founder's laptop window into the same plan
 * the supervisor runs on the phone: active plan calendar, variance vs actual,
 * and the delivery-promise checker. Read-only by design — plan generation
 * and activation stay in the mobile Plan tab where the supervisor works.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type PlanItem = {
  id: string;
  item_type: "production" | "delivery";
  item_date: string;
  product_name: string;
  quantity: number;
  sale_order_ref: string;
  customer_name: string;
  status: "planned" | "done" | "partial" | "missed" | "moved";
  actual_quantity: number | null;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data as T;
}

function useActivePlan() {
  return useQuery({
    queryKey: ["web-plan-active"],
    queryFn: () =>
      getJson<{ plan: { name?: string; horizon_start?: string; horizon_end?: string } | null; items: PlanItem[] }>(
        "/api/ops-planning/plans/active",
      ),
  });
}

function useVariance() {
  return useQuery({
    queryKey: ["web-plan-variance"],
    queryFn: () =>
      getJson<{
        window: { from: string; to: string };
        production: { planned_units: number; actual_units: number; fulfillment_pct: number | null };
        deliveries: { planned: number; completed: number };
      }>("/api/ops-planning/variance?days=14"),
  });
}

const STATUS_BADGE: Record<PlanItem["status"], string> = {
  planned: "bg-slate-100 text-slate-600",
  done: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  missed: "bg-red-100 text-red-700",
  moved: "bg-violet-100 text-violet-700",
};

const nfmt = (n: number) => Math.round(n).toLocaleString("en-IN");

export default function PlanningWebPage() {
  const plan = useActivePlan();
  const variance = useVariance();
  const [typeFilter, setTypeFilter] = useState<"all" | "production" | "delivery">("all");

  const items = (plan.data?.items ?? []).filter(
    (i) => typeFilter === "all" || i.item_type === typeFilter,
  );

  // Group by date for a calendar-style read.
  const byDate = new Map<string, PlanItem[]>();
  for (const i of items) {
    const arr = byDate.get(i.item_date) ?? [];
    arr.push(i);
    byDate.set(i.item_date, arr);
  }
  const dates = [...byDate.keys()].sort();
  const v = variance.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">🏭 Production Plan</h1>
        <p className="text-sm text-slate-500">
          Read-only view of the active plan. Generate / activate from the mobile Plan tab.
        </p>
      </div>

      {/* Variance strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Planned (14d)</div>
          <div className="text-2xl font-bold text-slate-900">
            {v ? nfmt(v.production.planned_units) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Produced</div>
          <div className="text-2xl font-bold text-slate-900">
            {v ? nfmt(v.production.actual_units) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Fulfilment</div>
          <div
            className={`text-2xl font-bold ${
              (v?.production.fulfillment_pct ?? 100) >= 90
                ? "text-green-600"
                : (v?.production.fulfillment_pct ?? 100) >= 70
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            {v?.production.fulfillment_pct != null ? `${Math.round(v.production.fulfillment_pct)}%` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Deliveries</div>
          <div className="text-2xl font-bold text-slate-900">
            {v ? `${v.deliveries.completed} / ${v.deliveries.planned}` : "—"}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-3 flex gap-2">
        {(["all", "production", "delivery"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
              typeFilter === t
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t === "all" ? "All" : t === "production" ? "🏭 Production" : "🚚 Deliveries"}
          </button>
        ))}
        {plan.data?.plan?.name ? (
          <span className="ml-auto self-center text-xs text-slate-400">
            {String(plan.data.plan.name)}
          </span>
        ) : null}
      </div>

      {plan.isLoading ? (
        <div className="py-16 text-center text-slate-400">Loading plan…</div>
      ) : plan.isError ? (
        <div className="py-16 text-center text-red-500">
          {plan.error instanceof Error ? plan.error.message : "Failed to load plan"}
        </div>
      ) : !plan.data?.plan ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
          No active plan. Generate one from the mobile app → Plan tab → Sync → Generate → Activate.
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map((d) => (
            <div key={d} className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                {new Date(d).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <div className="divide-y divide-slate-50">
                {byDate.get(d)!.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span>{i.item_type === "production" ? "🏭" : "🚚"}</span>
                    <span className="flex-1 text-slate-800">
                      {i.product_name} — {nfmt(i.quantity)}
                      {i.actual_quantity != null ? (
                        <span className="text-slate-400"> (actual {nfmt(i.actual_quantity)})</span>
                      ) : null}
                    </span>
                    <span className="hidden text-xs text-slate-400 md:inline">
                      {i.customer_name || i.sale_order_ref}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[i.status]}`}>
                      {i.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
