"use client";

/**
 * One node of the Process Map (PRD §7.2) — plain numbered step with owner
 * role chip, stage-type badge (DECISION / HANDOVER / END) and gate count.
 * Definition maps do not use the ✓ ● ! ○ glyphs; those belong to live cases.
 */
import {
  PROCESS_ROLE_LABELS,
  type ProcessStageType,
  type ProcessStageView,
} from "@maiyuri/shared";

export interface ProcessStageCardProps {
  stage: ProcessStageView;
  index: number;
  selected?: boolean;
  onSelect?: (stage: ProcessStageView) => void;
  /** horizontal = stepper node, vertical = journey list row */
  orientation?: "horizontal" | "vertical";
}

export const STAGE_TYPE_BADGE: Partial<Record<ProcessStageType, string>> = {
  DECISION: "Decision",
  HANDOVER: "Handover",
  END: "End",
  WAIT: "Wait",
  AUTOMATION: "Auto",
};

export function formatSla(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = hours / 24;
  return `${Math.round(days * 10) / 10} d`;
}

export function ProcessStageCard({
  stage,
  index,
  selected = false,
  onSelect,
  orientation = "horizontal",
}: ProcessStageCardProps) {
  const badge = STAGE_TYPE_BADGE[stage.stage_type];
  const gateCount = stage.gates?.length ?? 0;
  const sla = formatSla(stage.sla_minutes);
  const horizontal = orientation === "horizontal";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(stage)}
      aria-pressed={selected}
      className={`group flex text-left transition-colors ${
        horizontal
          ? "w-44 flex-shrink-0 flex-col gap-2 rounded-2xl border p-3"
          : "w-full items-start gap-3 rounded-2xl border p-3"
      } ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          selected
            ? "bg-primary text-white"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
          {stage.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}
          </span>
          {badge && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
          {gateCount > 0
            ? `${gateCount} gate${gateCount === 1 ? "" : "s"}`
            : "No gates"}
          {sla ? ` · SLA ${sla}` : ""}
        </span>
      </span>
    </button>
  );
}
