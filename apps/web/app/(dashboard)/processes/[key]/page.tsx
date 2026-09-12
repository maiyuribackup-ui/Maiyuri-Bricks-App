"use client";

/**
 * Process Map (PRD §7.2): numbered stepper on md+, vertical journey below.
 * Click a stage → side panel with checklist, gates, transitions, SLA, SOP.
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, X } from "lucide-react";
import {
  PROCESS_CATEGORY_LABELS,
  PROCESS_ROLE_LABELS,
  type ProcessStageView,
} from "@maiyuri/shared";
import { useAuthStore } from "@/stores/authStore";
import { useProcessDefinition } from "@/hooks/useProcess";
import { ProcessStageCard, STAGE_TYPE_BADGE, formatSla } from "@/components/process/ProcessStageCard";
import { humanizeKey } from "@/components/process/ProcessGateList";

function StageDrawer({
  stage,
  stages,
  onClose,
}: {
  stage: ProcessStageView;
  stages: ProcessStageView[];
  onClose: () => void;
}) {
  const nameOf = (id: string) => stages.find((s) => s.id === id)?.name ?? "?";
  const sla = formatSla(stage.sla_minutes);
  const sopSlug = stage.configuration?.sop_slug;
  return (
    <aside
      aria-label={`Stage: ${stage.name}`}
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:sticky md:top-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}
            </span>
            {STAGE_TYPE_BADGE[stage.stage_type] && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {STAGE_TYPE_BADGE[stage.stage_type]}
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">{stage.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stage details"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {stage.description && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{stage.description}</p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div><dt className="inline font-semibold">SLA: </dt><dd className="inline">{sla ?? "none"}</dd></div>
        <div><dt className="inline font-semibold">Key: </dt><dd className="inline font-mono">{stage.stage_key}</dd></div>
      </dl>
      <Link
        href={sopSlug ? "/onehub#sop-library" : "/knowledge"}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <BookOpen className="h-4 w-4" /> How do I do this?
      </Link>

      <section className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Checklist</h3>
        {stage.checklist.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">No checklist.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {stage.checklist.map((item) => (
              <li key={item.id} className="text-sm text-slate-700 dark:text-slate-200">
                ☐ {item.title}
                {item.required && <span className="ml-1 text-rose-500">*</span>}
                {item.evidence_required && <span className="ml-1 text-[11px] text-slate-400">(evidence)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Gates</h3>
        {stage.gates.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">No gates.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {stage.gates.map((gate) => (
              <li key={gate.id} className="text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-100">{humanizeKey(gate.gate_key)}</span>
                <span className="ml-1 text-[11px] text-slate-400">{gate.gate_type}{gate.overridable ? "" : " · not overridable"}</span>
                {gate.failure_message && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{gate.failure_message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Next</h3>
        {stage.transitions.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">End of process.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {stage.transitions.map((t) => (
              <li key={t.id} className="text-sm text-slate-700 dark:text-slate-200">
                → {nameOf(t.to_stage_id)}
                <span className="ml-1 text-xs text-slate-400">
                  {t.label ?? humanizeKey(t.transition_key)}
                  {t.condition?.outcome ? ` · on “${humanizeKey(t.condition.outcome)}”` : ""}
                </span>
                {t.is_exception && (
                  <span className="ml-1 rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    exception
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
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
  const def = query.data;
  const stages = useMemo(
    () => [...(def?.stages ?? [])].sort((a, b) => a.sequence - b.sequence),
    [def?.stages],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = stages.find((s) => s.id === selectedId) ?? null;

  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />;
  }
  if (query.isError || !def) {
    return (
      <div className="space-y-3">
        <Link href="/processes" className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Processes</Link>
        <p role="alert" className="text-sm text-rose-600">
          {query.error instanceof Error ? query.error.message : "Process not found"}
        </p>
      </div>
    );
  }

  const currentVersion = def.version?.version ?? null;

  return (
    <div className="space-y-4">
      <Link href="/processes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Processes
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {PROCESS_CATEGORY_LABELS[def.category] ?? def.category}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{def.name}</h1>
          {def.description && <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{def.description}</p>}
          <p className="mt-1 text-xs text-slate-400">
            {stages.length} stages · v{currentVersion ?? "—"} {def.version?.status ? `(${def.version.status.toLowerCase()})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="version-select">Version</label>
          <select
            id="version-select"
            value={currentVersion ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              router.push(`/processes/${encodeURIComponent(key)}${v ? `?version=${encodeURIComponent(v)}` : ""}`);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            {(def.versions ?? []).map((v) => (
              <option key={v.id} value={v.version}>
                v{v.version} · {v.status.toLowerCase()}
              </option>
            ))}
          </select>
          {isPartner && (
            <Link
              href={`/processes/${encodeURIComponent(key)}/versions/${encodeURIComponent(currentVersion ?? "new")}/edit`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
            >
              Edit (JSON)
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <div>
          {/* Horizontal stepper (md+) */}
          <ol className="hidden items-stretch gap-2 overflow-x-auto pb-2 md:flex" aria-label="Process stages">
            {stages.map((stage, i) => (
              <li key={stage.id} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true" className="h-px w-4 flex-shrink-0 bg-slate-300 dark:bg-slate-600" />}
                <ProcessStageCard stage={stage} index={i} selected={stage.id === selectedId} onSelect={(s) => setSelectedId(s.id)} />
              </li>
            ))}
          </ol>
          {/* Vertical journey (below md) */}
          <ol className="space-y-2 md:hidden" aria-label="Process stages">
            {stages.map((stage, i) => (
              <li key={stage.id}>
                <ProcessStageCard stage={stage} index={i} orientation="vertical" selected={stage.id === selectedId} onSelect={(s) => setSelectedId(s.id === selectedId ? "" : s.id)} />
                {selected?.id === stage.id && (
                  <div className="mt-2 md:hidden">
                    <StageDrawer stage={selected} stages={stages} onClose={() => setSelectedId(null)} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="hidden md:block">
          {selected ? (
            <StageDrawer stage={selected} stages={stages} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Select a stage to see its checklist, gates and next steps.
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
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />}>
      <ProcessMapContent />
    </Suspense>
  );
}
