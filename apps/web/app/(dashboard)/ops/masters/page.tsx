"use client";

/**
 * Operations Control — Masters.
 *
 * Phase 1 of the Production, Fulfilment & Dispatch Control PRD. Every
 * operational value the system uses is configured here; nothing is hard-coded.
 *
 * The empty states matter as much as the tables: labour rates and cement
 * ratios ship deliberately UNSET (PRD §100 — the PRD's Rs.7/Rs.6 and
 * 140-bricks-per-bag figures are illustrative and must come from the
 * business), so this screen has to say so plainly rather than looking broken.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";

type Tab = "rates" | "standards" | "capacities" | "reasons" | "mapping" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "rates", label: "Activity rates" },
  { key: "standards", label: "Cement standards" },
  { key: "capacities", label: "Vehicle capacity" },
  { key: "reasons", label: "Deviation reasons" },
  { key: "mapping", label: "Odoo product mapping" },
  { key: "settings", label: "Operational settings" },
];

interface Envelope<T> {
  data: T | null;
  error: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json()) as Envelope<T>;
  if (!res.ok || body.error) throw new Error(body.error ?? "Request failed");
  return body.data as T;
}

interface NamedProduct {
  id: string;
  name: string;
}
interface RateRow {
  id: string;
  activity_code: string;
  rate: number;
  uom: string;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  finished_goods: NamedProduct | null;
}
interface StandardRow {
  id: string;
  material: string;
  standard_yield: number;
  tolerance_pct: number | null;
  effective_from: string;
  effective_to: string | null;
  finished_goods: NamedProduct | null;
}
interface CapacityRow {
  id: string;
  full_load_qty: number;
  effective_from: string;
  effective_to: string | null;
  oc_vehicles: { id: string; vehicle_type: string } | null;
  finished_goods: NamedProduct | null;
}
interface ReasonRow {
  id: string;
  scope: string;
  code: string;
  label: string;
}
interface MappingRow {
  id: string;
  odoo_product_id: number;
  odoo_product_name: string | null;
  finished_goods: NamedProduct | null;
}
interface MappingPayload {
  mappings: MappingRow[];
  finished_goods: { id: string; name: string; odoo_product_id: number | null }[];
}
interface SettingsRow {
  default_shifts_per_day: number;
  normal_max_trips_per_day: number;
  load_green_min_pct: number;
  load_yellow_min_pct: number;
  load_red_above_pct: number;
  cement_bag_kg: number;
  cement_bag_step: number;
  ratio_amber_tolerance_pct: number;
  ratio_red_tolerance_pct: number;
  production_wage_basis: string;
  output_per_person_basis: string;
}

const BASE = "/api/ops-control/masters";

function period(from: string, to: string | null): string {
  return to ? `${from} → ${to}` : `${from} → current`;
}

function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-700">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-400">
        {children}
      </td>
    </tr>
  );
}

function Panel({
  title,
  description,
  isLoading,
  error,
  children,
}: {
  title: string;
  description: string;
  isLoading: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {(error as Error).message}
        </p>
      ) : (
        children
      )}
    </Card>
  );
}

function RatesPanel() {
  const q = useQuery({
    queryKey: ["oc", "rates"],
    queryFn: () => fetchJson<RateRow[]>(`${BASE}/activity-rates`),
  });
  return (
    <Panel
      title="Activity rates"
      description="Per product, per activity, effective-dated. A rate is never edited in place — close the current period and open a new one, so past weeks keep paying the rate that applied then."
      isLoading={q.isLoading}
      error={q.error}
    >
      <Table headers={["Product", "Activity", "Rate", "Period", "Status"]}>
        {(q.data ?? []).length === 0 ? (
          <Empty colSpan={5}>
            No rates configured yet. Production, loading and unloading rates must
            be entered by the business before labour can be calculated.
          </Empty>
        ) : (
          q.data!.map((r) => (
            <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/50">
              <td className="px-4 py-3">{r.finished_goods?.name ?? "—"}</td>
              <td className="px-4 py-3 capitalize">{r.activity_code}</td>
              <td className="px-4 py-3 tabular-nums">
                ₹{Number(r.rate).toFixed(2)}
                <span className="text-slate-400"> / {r.uom.replace("per_", "")}</span>
              </td>
              <td className="px-4 py-3 tabular-nums text-slate-500">
                {period(r.effective_from, r.effective_to)}
              </td>
              <td className="px-4 py-3">
                {r.active ? (
                  <span className="text-emerald-600">Active</span>
                ) : (
                  <span className="text-slate-400">Superseded</span>
                )}
              </td>
            </tr>
          ))
        )}
      </Table>
    </Panel>
  );
}

function StandardsPanel() {
  const q = useQuery({
    queryKey: ["oc", "standards"],
    queryFn: () => fetchJson<StandardRow[]>(`${BASE}/consumption-standards`),
  });
  return (
    <Panel
      title="Cement consumption standards"
      description="Expected bricks per 50 kg bag, per product. Actual ratio always uses gross production — rejected bricks consumed cement too."
      isLoading={q.isLoading}
      error={q.error}
    >
      <Table headers={["Product", "Material", "Bricks / bag", "Tolerance", "Period"]}>
        {(q.data ?? []).length === 0 ? (
          <Empty colSpan={5}>
            No standards configured yet. Ratios differ by product and must be
            supplied by the business — none are assumed.
          </Empty>
        ) : (
          q.data!.map((s) => (
            <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/50">
              <td className="px-4 py-3">{s.finished_goods?.name ?? "—"}</td>
              <td className="px-4 py-3 capitalize">{s.material}</td>
              <td className="px-4 py-3 tabular-nums">{Number(s.standard_yield).toFixed(1)}</td>
              <td className="px-4 py-3 tabular-nums text-slate-500">
                {s.tolerance_pct === null ? "Global default" : `±${s.tolerance_pct}%`}
              </td>
              <td className="px-4 py-3 tabular-nums text-slate-500">
                {period(s.effective_from, s.effective_to)}
              </td>
            </tr>
          ))
        )}
      </Table>
    </Panel>
  );
}

function CapacitiesPanel() {
  const q = useQuery({
    queryKey: ["oc", "capacities"],
    queryFn: () => fetchJson<CapacityRow[]>(`${BASE}/vehicle-capacities`),
  });
  return (
    <Panel
      title="Vehicle capacity"
      description="Maximum normal full load per vehicle and product. This is an operating standard, not a hard limit — exceeding it warns in red and still saves."
      isLoading={q.isLoading}
      error={q.error}
    >
      <Table headers={["Vehicle", "Product", "Full load", "Period"]}>
        {(q.data ?? []).length === 0 ? (
          <Empty colSpan={4}>No vehicle capacities configured.</Empty>
        ) : (
          q.data!.map((c) => (
            <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/50">
              <td className="px-4 py-3">{c.oc_vehicles?.vehicle_type ?? "—"}</td>
              <td className="px-4 py-3">{c.finished_goods?.name ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">
                {Number(c.full_load_qty).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 tabular-nums text-slate-500">
                {period(c.effective_from, c.effective_to)}
              </td>
            </tr>
          ))
        )}
      </Table>
    </Panel>
  );
}

function ReasonsPanel() {
  const q = useQuery({
    queryKey: ["oc", "reasons"],
    queryFn: () => fetchJson<ReasonRow[]>(`${BASE}/deviation-reasons`),
  });
  const rows = q.data ?? [];
  const production = rows.filter((r) => r.scope === "production");
  const delivery = rows.filter((r) => r.scope === "delivery");
  return (
    <Panel
      title="Deviation reasons"
      description="Why production or a delivery differed from plan. Kept as configurable masters so a new reason is configuration, not a migration."
      isLoading={q.isLoading}
      error={q.error}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: "Production", items: production },
          { label: "Delivery", items: delivery },
        ].map((group) => (
          <div key={group.label}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              {group.label}
            </h3>
            <ul className="space-y-1 text-sm">
              {group.items.length === 0 ? (
                <li className="text-slate-400">None configured.</li>
              ) : (
                group.items.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-900/40"
                  >
                    {r.label}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MappingPanel() {
  const q = useQuery({
    queryKey: ["oc", "mapping"],
    queryFn: () => fetchJson<MappingPayload>(`${BASE}/product-mapping`),
  });
  const mappings = q.data?.mappings ?? [];
  return (
    <Panel
      title="Odoo product mapping"
      description="Links an Odoo product to a Maiyuri finished good. Only mapped products count as demand — service lines such as Loading and Unloading carry brick-sized quantities and must never enter the plan."
      isLoading={q.isLoading}
      error={q.error}
    >
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        Unmapped Odoo products with open demand are listed here once sales-order
        line sync ships in Phase 2. Until then this shows the links already
        resolved from Odoo product ids.
      </p>
      <Table headers={["Odoo product", "Odoo id", "Maiyuri finished good"]}>
        {mappings.length === 0 ? (
          <Empty colSpan={3}>No product mappings yet.</Empty>
        ) : (
          mappings.map((m) => (
            <tr key={m.id} className="border-b border-slate-50 dark:border-slate-700/50">
              <td className="px-4 py-3">{m.odoo_product_name ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums text-slate-500">{m.odoo_product_id}</td>
              <td className="px-4 py-3">{m.finished_goods?.name ?? "—"}</td>
            </tr>
          ))
        )}
      </Table>
    </Panel>
  );
}

function SettingsPanel() {
  const q = useQuery({
    queryKey: ["oc", "settings"],
    queryFn: () => fetchJson<SettingsRow>(`${BASE}/settings`),
  });
  const s = q.data;
  const rows: { label: string; value: string }[] = s
    ? [
        { label: "Default shifts per day", value: String(s.default_shifts_per_day) },
        { label: "Normal maximum trips per day", value: String(s.normal_max_trips_per_day) },
        { label: "Full load — green from", value: `${s.load_green_min_pct}%` },
        { label: "Partial load — yellow from", value: `${s.load_yellow_min_pct}%` },
        { label: "Overload — red above", value: `${s.load_red_above_pct}%` },
        { label: "Cement bag weight", value: `${s.cement_bag_kg} kg` },
        { label: "Cement entry step", value: `${s.cement_bag_step} bag` },
        { label: "Ratio tolerance — amber", value: `±${s.ratio_amber_tolerance_pct}%` },
        { label: "Ratio tolerance — red", value: `±${s.ratio_red_tolerance_pct}%` },
        { label: "Production wage basis", value: s.production_wage_basis },
        { label: "Output per person-shift basis", value: s.output_per_person_basis },
      ]
    : [];
  return (
    <Panel
      title="Operational settings"
      description="The thresholds every warning bands against. Changing one changes how the whole system reads — restricted to founder and owner, and audited."
      isLoading={q.isLoading}
      error={q.error}
    >
      <Table headers={["Setting", "Value"]}>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-slate-50 dark:border-slate-700/50">
            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.label}</td>
            <td className="px-4 py-3 font-medium tabular-nums">{r.value}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-slate-400">
        The cement ratio always uses gross production; the labour wage basis is
        configured separately and is deliberately not the same setting.
      </p>
    </Panel>
  );
}

export default function OpsMastersPage() {
  const [tab, setTab] = useState<Tab>("rates");
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "rates" && <RatesPanel />}
      {tab === "standards" && <StandardsPanel />}
      {tab === "capacities" && <CapacitiesPanel />}
      {tab === "reasons" && <ReasonsPanel />}
      {tab === "mapping" && <MappingPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
