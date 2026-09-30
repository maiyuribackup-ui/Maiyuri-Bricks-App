"use client";

/**
 * Journey strip (PRD §7.4 / §25): ✓ completed · ● current · ! blocked/failed
 * · ○ upcoming. Horizontal scroll by default; `condensed` renders the
 * "Previous ✓ / Current ● / Next ○" form for narrow layouts (PRD §24).
 */
import Link from "next/link";
import {
  PROCESS_STATUS_GLYPH,
  type ProcessJourneyStep,
  type ProcessStageInstanceStatus,
} from "@maiyuri/shared";

export interface ProcessJourneyProps {
  steps: ProcessJourneyStep[];
  /** Vertical "Previous / Current / Next" mode for phones and side panels. */
  condensed?: boolean;
  /** Wraps the strip in a link (e.g. to the case page). */
  href?: string;
  className?: string;
}

const STATUS_TONE: Record<ProcessStageInstanceStatus, string> = {
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  current: "border-primary bg-primary text-white",
  blocked:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  failed:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  upcoming:
    "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500",
  skipped:
    "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500",
  cancelled:
    "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500",
};

const LABEL_TONE: Record<ProcessStageInstanceStatus, string> = {
  completed: "text-slate-600 dark:text-slate-300",
  current: "font-semibold text-slate-900 dark:text-white",
  blocked: "font-semibold text-rose-700 dark:text-rose-300",
  failed: "font-semibold text-rose-700 dark:text-rose-300",
  upcoming: "text-slate-400 dark:text-slate-500",
  skipped: "text-slate-400 line-through dark:text-slate-500",
  cancelled: "text-slate-400 line-through dark:text-slate-500",
};

export function journeyGlyph(status: ProcessStageInstanceStatus): string {
  return PROCESS_STATUS_GLYPH[status] ?? "○";
}

function Glyph({ status }: { status: ProcessStageInstanceStatus }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-sm font-bold ${STATUS_TONE[status] ?? STATUS_TONE.upcoming}`}
    >
      {journeyGlyph(status)}
    </span>
  );
}

function StepLabel({ step }: { step: ProcessJourneyStep }) {
  return (
    <span
      className={`text-xs ${LABEL_TONE[step.status] ?? LABEL_TONE.upcoming}`}
    >
      {step.name}
    </span>
  );
}

/** Pick previous / current / next around the live stage. */
export function condenseJourney(steps: ProcessJourneyStep[]) {
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  const currentIndex = sorted.findIndex((s) =>
    ["current", "blocked", "failed"].includes(s.status),
  );
  if (currentIndex === -1) {
    // Completed / cancelled case: show the last three.
    return sorted.slice(-3);
  }
  return sorted.slice(Math.max(0, currentIndex - 1), currentIndex + 2);
}

export function ProcessJourney({
  steps,
  condensed = false,
  href,
  className = "",
}: ProcessJourneyProps) {
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  const shown = condensed ? condenseJourney(sorted) : sorted;

  const body = condensed ? (
    <ol className="space-y-1.5" aria-label="Process journey">
      {shown.map((step) => (
        <li
          key={step.stage_id}
          className="flex items-center gap-2"
          data-status={step.status}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <Glyph status={step.status} />
          <span className="sr-only">{step.status}: </span>
          <StepLabel step={step} />
        </li>
      ))}
    </ol>
  ) : (
    <ol
      className="flex items-center gap-1 overflow-x-auto py-1"
      aria-label="Process journey"
    >
      {shown.map((step, index) => (
        <li
          key={step.stage_id}
          className="flex flex-shrink-0 items-center gap-1"
          data-status={step.status}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          {index > 0 && (
            <span
              aria-hidden="true"
              className="h-px w-3 bg-slate-200 dark:bg-slate-700"
            />
          )}
          <span className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2">
            <Glyph status={step.status} />
            <span className="sr-only">{step.status}: </span>
            <StepLabel step={step} />
          </span>
        </li>
      ))}
    </ol>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${className}`}
      >
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
