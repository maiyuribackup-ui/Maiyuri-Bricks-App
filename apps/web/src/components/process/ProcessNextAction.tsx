"use client";

/**
 * The hero of a case page: who owns the stage, how long is left, and the one
 * thing to do next. Colour follows the owning lane; blocked turns rose.
 */
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  GitBranch,
  Hourglass,
  ListChecks,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { PROCESS_ROLE_LABELS, type ProcessInstanceView } from "@maiyuri/shared";
import { laneFor } from "@/lib/process/map-layout";
import {
  deriveNextAction,
  describeDue,
  journeyProgress,
  type NextActionKind,
} from "@/lib/process/next-action";

const KIND_ICON: Record<NextActionKind, LucideIcon> = {
  blocked: AlertTriangle,
  handover: ArrowLeftRight,
  task: ListChecks,
  gate: ShieldAlert,
  decision: GitBranch,
  ready: CheckCircle2,
  waiting: Hourglass,
  done: Flag,
  cancelled: Flag,
};

const KIND_LABEL: Record<NextActionKind, string> = {
  blocked: "Blocked",
  handover: "Handover",
  task: "Next checklist item",
  gate: "Gate not met",
  decision: "Decision needed",
  ready: "Ready to complete",
  waiting: "Waiting on customer",
  done: "Complete",
  cancelled: "Cancelled",
};

export interface ProcessNextActionProps {
  view: ProcessInstanceView;
  assigneeName?: string | null;
  /** Jump to the checklist / action area. */
  onGo?: () => void;
  className?: string;
}

export function ProcessNextAction({
  view,
  assigneeName,
  onGo,
  className = "",
}: ProcessNextActionProps) {
  const action = deriveNextAction(view);
  const stage = view.current_stage;
  const si = view.current_stage_instance;
  const lane = stage ? laneFor(stage.owner_role) : laneFor("SALES_ENGINEER");
  const rose = action.kind === "blocked" || action.kind === "gate";
  const hue = rose ? "#e11d48" : lane.hue;
  const wash = rose ? "#fff1f2" : lane.wash;
  const deep = rose ? "#9f1239" : lane.deep;
  const Icon = KIND_ICON[action.kind];
  const due = describeDue(si?.due_at);
  const progress = journeyProgress(view);
  const owner =
    assigneeName ??
    (stage
      ? (PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role)
      : null);
  const terminal = action.kind === "done" || action.kind === "cancelled";

  return (
    <section
      aria-label="Next action"
      data-testid="process-next-action"
      className={`relative overflow-hidden rounded-3xl border bg-white ${className}`}
      style={{
        borderColor: `${hue}33`,
        boxShadow: `0 1px 2px rgba(15,23,42,.04), 0 18px 40px -28px ${hue}80`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: hue }}
      />
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
              style={{ background: wash, color: deep }}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {KIND_LABEL[action.kind]}
            </span>
            {stage && (
              <span className="text-slate-500">
                Stage {progress.done + 1} of {progress.total}: {stage.name}
              </span>
            )}
          </div>
          <h2 className="mt-2.5 text-balance text-[22px] font-bold leading-snug tracking-[-0.01em] text-slate-900 sm:text-2xl">
            {action.title}
          </h2>
          {action.detail && (
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">
              {action.detail}
            </p>
          )}
          {!terminal && (
            <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {owner && (
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Owner</dt>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: lane.wash, color: lane.deep }}
                  >
                    {initials(owner)}
                  </span>
                  <dd className="font-medium text-slate-800">{owner}</dd>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{lane.label}</span>
                </div>
              )}
              {due && (
                <div
                  className={`flex items-center gap-1.5 font-semibold ${
                    due.overdue ? "text-rose-600" : "text-slate-700"
                  }`}
                >
                  <dt className="sr-only">Due</dt>
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  <dd>{due.label}</dd>
                </div>
              )}
              {action.openRequired > 0 && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <dt className="sr-only">Open items</dt>
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  <dd>
                    {action.openRequired} required item
                    {action.openRequired === 1 ? "" : "s"} left
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
        {onGo && !terminal && (
          <button
            type="button"
            onClick={onGo}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold text-white shadow-sm transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: hue }}
          >
            {action.kind === "ready"
              ? "Complete stage"
              : action.kind === "handover"
                ? "Open handover"
                : "Do it now"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
