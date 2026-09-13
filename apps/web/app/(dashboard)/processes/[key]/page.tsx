"use client";

/**
 * Process Map (PRD §7.2) — swimlanes by owning role on an interactive canvas,
 * live case counts on every stage, and a drawer with the stage's checklist,
 * gates, next steps and the cases sitting on it right now.
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  ExternalLink,
  Layers,
  PencilLine,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  PROCESS_CATEGORY_LABELS,
  PROCESS_ROLE_LABELS,
  type ProcessStageLiveStats,
  type ProcessStageView,
} from "@maiyuri/shared";
import { useAuthStore } from "@/stores/authStore";
import { useProcessDefinition, useProcessStats } from "@/hooks/useProcess";
import {
  ProcessFlowMap,
  ProcessMapLegend,
} from "@/components/process/ProcessFlowMap";
import {
  ProcessStageCard,
  formatSla,
} from "@/components/process/ProcessStageCard";
import { humanizeKey } from "@/components/process/ProcessGateList";
import {
  STAGE_TYPE_STYLE,
  buildFlowGraph,
  laneFor,
} from "@/lib/process/map-layout";
import { describeDue } from "@/lib/process/next-action";

// ------------------------------------------------------------ drawer ----

function LiveCases({ stats }: { stats: ProcessStageLiveStats | null }) {
  if (!stats || stats.cases.length === 0) {
    return (
      <p className="mt-1 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400">
        No case is on this stage right now.
      </p>
    );
  }
  return (
    <ul className="mt-1 divide-y divide-slate-100">
      {stats.cases.map((c) => {
        const due = describeDue(c.due_at);
        const blocked = c.status === "blocked";
        return (
          <li key={c.stage_instance_id}>
            <Link
              href={`/processes/instances/${c.instance_id}`}
              className="group flex items-center gap-3 py-2 text-sm"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  blocked
                    ? "bg-rose-500"
                    : c.is_overdue
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800 group-hover:text-indigo-700">
                  {c.customer_name ?? "Unnamed case"}
                  {c.order_ref && (
                    <span className="font-normal text-slate-400">
                      {" "}
                      · {c.order_ref}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {c.assignee_name ?? "Unassigned"}
                  {due && (
                    <span
                      className={
                        due.overdue ? "font-semibold text-rose-600" : ""
                      }
                    >
                      {" "}
                      · {due.label}
                    </span>
                  )}
                  {blocked && (
                    <span className="font-semibold text-rose-600">
                      {" "}
                      · blocked
                    </span>
                  )}
                </span>
              </span>
              <ArrowRight
                className="h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
      {stats.open > stats.cases.length && (
        <li className="py-2 text-[11px] text-slate-400">
          + {stats.open - stats.cases.length} more
        </li>
      )}
    </ul>
  );
}

function StageDrawer({
  stage,
  index,
  stages,
  stats,
  onClose,
}: {
  stage: ProcessStageView;
  index: number;
  stages: ProcessStageView[];
  stats: ProcessStageLiveStats | null;
  onClose: () => void;
}) {
  const nameOf = (id: string) => stages.find((s) => s.id === id)?.name ?? "?";
  const lane = laneFor(stage.owner_role);
  const type = STAGE_TYPE_STYLE[stage.stage_type];
  const sla = formatSla(stage.sla_minutes);
  const sopSlug = stage.configuration?.sop_slug;
  return (
    <aside
      aria-label={`Stage: ${stage.name}`}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white md:sticky md:top-4"
    >
      <div
        className="flex items-start justify-between gap-3 px-5 pb-4 pt-5"
        style={{ background: lane.wash }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span
              className="rounded-full px-2 py-0.5"
              style={{ background: "#fff", color: lane.deep }}
            >
              {lane.label} ·{" "}
              {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}
            </span>
            <span
              className="rounded-full px-2 py-0.5"
              style={{ background: type.wash, color: type.hue }}
            >
              {type.label}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold leading-tight text-slate-900">
            <span
              className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[13px] font-bold tabular-nums"
              style={{ color: lane.deep }}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {stage.name}
          </h2>
          {stage.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {stage.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stage details"
          className="rounded-lg p-2 text-slate-500 hover:bg-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            SLA {sla ?? "none"}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck
              className="h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            {stage.gates.length} gate{stage.gates.length === 1 ? "" : "s"}
          </span>
          <Link
            href={sopSlug ? "/onehub#sop-library" : "/knowledge"}
            className="inline-flex items-center gap-1 font-semibold text-indigo-700 underline-offset-2 hover:underline"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> How do I do
            this?
          </Link>
        </div>

        <section>
          <h3 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Live now
            {stats && stats.open > 0 && (
              <span className="flex items-center gap-1 normal-case tracking-normal">
                <span
                  className="rounded-full px-2 py-0.5 text-white"
                  style={{ background: lane.hue }}
                >
                  {stats.open}
                </span>
                {stats.overdue > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    {stats.overdue} late
                  </span>
                )}
                {stats.blocked > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                    {stats.blocked} blocked
                  </span>
                )}
              </span>
            )}
          </h3>
          <LiveCases stats={stats} />
        </section>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Checklist
          </h3>
          {stage.checklist.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">No checklist.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {stage.checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ background: item.required ? lane.hue : "#cbd5e1" }}
                  />
                  <span>
                    {item.title}
                    {item.evidence_required && (
                      <span className="ml-1 text-[11px] font-medium text-slate-400">
                        evidence
                      </span>
                    )}
                    {!item.required && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        optional
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Before moving on
          </h3>
          {stage.gates.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">No gates.</p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {stage.gates.map((gate) => (
                <li key={gate.id} className="text-sm">
                  <span className="font-medium text-slate-800">
                    {humanizeKey(gate.gate_key)}
                  </span>
                  <span className="ml-1.5 text-[11px] text-slate-400">
                    {humanizeKey(gate.gate_type).toLowerCase()}
                    {gate.overridable ? "" : " · cannot be overridden"}
                  </span>
                  {gate.failure_message && (
                    <p className="text-xs text-slate-500">
                      {gate.failure_message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Where it goes next
          </h3>
          {stage.transitions.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">End of process.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {stage.transitions.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  {t.is_exception ? (
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowRight
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    {nameOf(t.to_stage_id)}
                    <span className="ml-1 text-xs text-slate-400">
                      {t.label ?? humanizeKey(t.transition_key)}
                      {t.condition?.outcome
                        ? ` · on “${humanizeKey(t.condition.outcome)}”`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------ page ----

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "amber" | "rose";
}) {
  const cls =
    tone === "rose"
      ? "bg-rose-50 text-rose-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}
    >
      <span className="text-base font-bold tabular-nums leading-none">
        {value}
      </span>
      {label}
    </span>
  );
}

function ProcessMapContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = String(params.key ?? "").toUpperCase();
  const versionParam = searchParams.get("version");
  const user = useAuthStore((s) => s.user);
  const isPartner = ["founder", "owner"].includes(user?.role ?? "");

  const query = useProcessDefinition(key, versionParam);
  const statsQuery = useProcessStats(key);
  const def = query.data;
  const stats = statsQuery.data ?? null;
  const stages = useMemo(
    () => [...(def?.stages ?? [])].sort((a, b) => a.sequence - b.sequence),
    [def?.stages],
  );
  const graph = useMemo(
    () => buildFlowGraph(stages, stats, null),
    [stages, stats],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = stages.findIndex((s) => s.id === selectedId);
  const selected = selectedIndex >= 0 ? stages[selectedIndex] : null;

  if (query.isLoading) {
    return (
      <div className="h-[28rem] animate-pulse rounded-3xl border border-slate-200 bg-white" />
    );
  }
  if (query.isError || !def) {
    return (
      <div className="space-y-3">
        <Link
          href="/processes"
          className="inline-flex items-center gap-1 text-sm text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" /> Processes
        </Link>
        <p role="alert" className="text-sm text-rose-600">
          {query.error instanceof Error
            ? query.error.message
            : "Process not found"}
        </p>
      </div>
    );
  }

  const currentVersion = def.version?.version ?? null;
  const versionStatus = def.version?.status?.toLowerCase() ?? null;

  return (
    <div className="space-y-5">
      <Link
        href="/processes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Processes
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-balance text-[28px] font-bold leading-tight tracking-[-0.015em] text-slate-900">
            {def.name}
            <span className="ml-3 align-middle text-sm font-semibold text-slate-400">
              {PROCESS_CATEGORY_LABELS[def.category] ?? def.category}
            </span>
          </h1>
          {def.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {def.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatPill
              label="live cases"
              value={stats?.total_open ?? 0}
              tone="neutral"
            />
            <StatPill
              label="overdue"
              value={stats?.total_overdue ?? 0}
              tone={stats?.total_overdue ? "amber" : "neutral"}
            />
            <StatPill
              label="blocked"
              value={stats?.total_blocked ?? 0}
              tone={stats?.total_blocked ? "rose" : "neutral"}
            />
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {stages.length} stages · {graph.lanes.length} owners
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="version-select">
            Version
          </label>
          <select
            id="version-select"
            value={currentVersion ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              router.push(
                `/processes/${encodeURIComponent(key)}${v ? `?version=${encodeURIComponent(v)}` : ""}`,
              );
            }}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"
          >
            {(def.versions ?? []).map((v) => (
              <option key={v.id} value={v.version}>
                v{v.version} · {v.status.toLowerCase()}
              </option>
            ))}
          </select>
          {versionStatus && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                versionStatus === "active"
                  ? "bg-emerald-50 text-emerald-700"
                  : versionStatus === "draft"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {versionStatus}
            </span>
          )}
          {isPartner && (
            <Link
              href={`/processes/${encodeURIComponent(key)}/versions/${encodeURIComponent(currentVersion ?? "new")}/edit`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <PencilLine className="h-4 w-4" aria-hidden="true" /> Edit
              definition
            </Link>
          )}
        </div>
      </header>

      <ProcessMapLegend lanes={graph.lanes} />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="hidden md:block">
            <ProcessFlowMap
              stages={stages}
              stats={stats}
              selectedId={selectedId}
              onSelect={(s) => setSelectedId(s?.id ?? null)}
            />
            {statsQuery.isError && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                Live counts unavailable right now.
              </p>
            )}
          </div>
          {/* Phones: a vertical journey, the drawer opens inline under the tapped stage. */}
          <ol className="space-y-2 md:hidden" aria-label="Process stages">
            {stages.map((stage, i) => (
              <li key={stage.id}>
                <ProcessStageCard
                  stage={stage}
                  index={i}
                  orientation="vertical"
                  selected={stage.id === selectedId}
                  onSelect={(s) =>
                    setSelectedId(s.id === selectedId ? null : s.id)
                  }
                />
                {selected?.id === stage.id && (
                  <div className="mt-2">
                    <StageDrawer
                      stage={selected}
                      index={i}
                      stages={stages}
                      stats={stats?.stages[stage.stage_key] ?? null}
                      onClose={() => setSelectedId(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="hidden md:block">
          {selected ? (
            <StageDrawer
              stage={selected}
              index={selectedIndex}
              stages={stages}
              stats={stats?.stages[selected.stage_key] ?? null}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
              <p className="font-semibold text-slate-700">
                Pick a stage on the map
              </p>
              <p className="mt-1 leading-relaxed">
                You will see its checklist, the gates it must pass, where it can
                go next, and every case sitting on it right now.
              </p>
              <Link
                href="/processes#work"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> All
                live cases
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** useSearchParams needs a Suspense boundary for static rendering (Next 14). */
export default function ProcessMapPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[28rem] animate-pulse rounded-3xl border border-slate-200 bg-white" />
      }
    >
      <ProcessMapContent />
    </Suspense>
  );
}
