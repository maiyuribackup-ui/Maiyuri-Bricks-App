"use client";

/** Gate status list: ok ✓ · fail ! · unknown ? · overridden ⤳ (PRD §7.3). */
import type { ProcessGateResult } from "@maiyuri/shared";

export interface ProcessGateListProps {
  gates: ProcessGateResult[];
  /** Partner-only: shown next to failed, overridable gates. */
  onOverride?: (gate: ProcessGateResult) => void;
  disabled?: boolean;
}

const GATE_GLYPH: Record<ProcessGateResult["status"], string> = {
  ok: "✓",
  fail: "!",
  unknown: "?",
  overridden: "↷",
};

const GATE_TONE: Record<ProcessGateResult["status"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  fail: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  unknown:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  overridden:
    "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const GATE_LABEL: Record<ProcessGateResult["status"], string> = {
  ok: "Passed",
  fail: "Not yet",
  unknown: "Cannot verify",
  overridden: "Overridden",
};

export function humanizeKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ProcessGateList({
  gates,
  onOverride,
  disabled = false,
}: ProcessGateListProps) {
  if (gates.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        No gates on this stage.
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Stage gates">
      {gates.map((gate) => (
        <li
          key={gate.gate_key}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
          data-gate-status={gate.status}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${GATE_TONE[gate.status]}`}
          >
            {GATE_GLYPH[gate.status]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {humanizeKey(gate.gate_key)}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-slate-400">
                {GATE_LABEL[gate.status]}
              </span>
            </div>
            {gate.message && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {gate.message}
              </p>
            )}
          </div>
          {onOverride && gate.status === "fail" && gate.overridable && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOverride(gate)}
              className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Override
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
