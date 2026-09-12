"use client";

/**
 * Process Library (PRD §7.1): cards per category, search across processes
 * and my active cases, and a "My process work" strip.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Workflow } from "lucide-react";
import {
  PROCESS_CATEGORY_LABELS,
  PROCESS_ROLE_LABELS,
  type ProcessCategory,
  type ProcessDefinitionView,
  type ProcessWorkStageItem,
} from "@maiyuri/shared";
import { useAuthStore } from "@/stores/authStore";
import {
  useProcessDefinitions,
  useProcessWork,
  useSeedProcessDefinitions,
} from "@/hooks/useProcess";

const CATEGORY_ORDER: ProcessCategory[] = [
  "SALES",
  "FACTORY",
  "DELIVERY",
  "FINANCE",
  "PROJECTS",
  "SAFETY",
];

function matches(def: ProcessDefinitionView, q: string): boolean {
  if (!q) return true;
  const hay = `${def.name} ${def.description ?? ""} ${def.process_key}`.toLowerCase();
  return hay.includes(q);
}

function caseMatches(item: ProcessWorkStageItem, q: string): boolean {
  if (!q) return false;
  const ctx = item.instance.context ?? {};
  const hay = [
    item.definition.name,
    item.stage.name,
    ctx.customer_name,
    ctx.odoo_order_name,
    ctx.product_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function ProcessCard({ def }: { def: ProcessDefinitionView }) {
  const status = def.version?.status ?? "DRAFT";
  return (
    <Link
      href={`/processes/${encodeURIComponent(def.process_key)}`}
      className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{def.name}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            status === "ACTIVE"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {status === "ACTIVE" ? "Active" : status === "RETIRED" ? "Retired" : "Draft"}
        </span>
      </div>
      {def.description && (
        <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{def.description}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>{PROCESS_CATEGORY_LABELS[def.category] ?? def.category}</span>
        <span>v{def.version?.version ?? "—"}</span>
        <span>{def.stage_count} stages</span>
      </div>
      {def.owner_roles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {def.owner_roles.map((r) => (
            <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {PROCESS_ROLE_LABELS[r] ?? r}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function WorkStrip() {
  const work = useProcessWork();
  const s = work.data?.summary;
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: "Mine", value: s?.mine ?? 0, tone: "text-slate-900 dark:text-white" },
    { label: "Role queue", value: s?.role ?? 0, tone: "text-slate-900 dark:text-white" },
    { label: "Handovers", value: s?.handovers ?? 0, tone: "text-amber-700 dark:text-amber-300" },
    { label: "Overdue", value: s?.overdue ?? 0, tone: "text-rose-700 dark:text-rose-300" },
  ];
  return (
    <Link
      href="/onehub/my-work"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
    >
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">My process work</span>
      {tiles.map((t) => (
        <span key={t.label} className="flex items-baseline gap-1.5">
          <span className={`text-lg font-bold ${t.tone}`}>{work.isLoading ? "…" : t.value}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{t.label}</span>
        </span>
      ))}
      <span className="ml-auto text-xs font-medium text-primary">Open My Work →</span>
    </Link>
  );
}

export default function ProcessLibraryPage() {
  const user = useAuthStore((s) => s.user);
  const isPartner = ["founder", "owner"].includes(user?.role ?? "");
  const defs = useProcessDefinitions();
  const work = useProcessWork();
  const seed = useSeedProcessDefinitions();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const grouped = useMemo(() => {
    const list = (defs.data ?? []).filter((d) => matches(d, q));
    const map = new Map<ProcessCategory, ProcessDefinitionView[]>();
    for (const d of list) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => [c, map.get(c) ?? []] as const);
  }, [defs.data, q]);

  const matchingCases = useMemo(() => {
    const all = [...(work.data?.mine ?? []), ...(work.data?.role ?? [])];
    const seen = new Set<string>();
    return all.filter((item) => {
      if (seen.has(item.stage_instance.id)) return false;
      seen.add(item.stage_instance.id);
      return caseMatches(item, q);
    });
  }, [work.data, q]);

  const isEmpty = !defs.isLoading && (defs.data?.length ?? 0) === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Workflow className="h-6 w-6 text-primary" /> Processes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            How work moves through Maiyuri — one map per process, one case per customer.
          </p>
        </div>
        {isPartner && (
          <Link
            href="/processes/LEAD_TO_DELIVERY/versions/new/edit"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Import / role defaults
          </Link>
        )}
      </div>

      <WorkStrip />

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search processes or my active cases…"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          aria-label="Search processes"
        />
      </label>

      {defs.isError && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {defs.error instanceof Error ? defs.error.message : "Failed to load processes"}
        </p>
      )}

      {q && matchingCases.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">My active cases</h2>
          <ul className="space-y-2">
            {matchingCases.map((item) => (
              <li key={item.stage_instance.id}>
                <Link
                  href={`/processes/instances/${item.instance.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                >
                  <span className="font-medium text-slate-900 dark:text-white">
                    {String(item.instance.context?.customer_name ?? item.instance.entity_id)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {item.definition.name} · {item.stage.name}
                    {item.is_overdue ? " · overdue" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {defs.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">No processes yet.</p>
          {isPartner && (
            <button
              type="button"
              disabled={seed.isPending}
              onClick={() => seed.mutate()}
              className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {seed.isPending ? "Seeding…" : "Seed built-in processes"}
            </button>
          )}
          {seed.isError && (
            <p role="alert" className="mt-2 text-xs text-rose-600">
              {seed.error instanceof Error ? seed.error.message : "Seeding failed"}
            </p>
          )}
        </div>
      )}

      {grouped.map(([category, list]) => (
        <section key={category}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            {PROCESS_CATEGORY_LABELS[category] ?? category}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((def) => (
              <ProcessCard key={def.id} def={def} />
            ))}
          </div>
        </section>
      ))}

      {!isEmpty && !defs.isLoading && grouped.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No process matches “{search}”.</p>
      )}
    </div>
  );
}
