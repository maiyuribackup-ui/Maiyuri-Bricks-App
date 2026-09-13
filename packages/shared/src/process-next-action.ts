/**
 * "What do I do now?" — one sentence derived from the live case view
 * (pure; shared by the web case page, the native case screen and tests). Order of truth:
 * blocked → pending handover → open required checklist → failing gate →
 * decision needed → ready to complete → done.
 */
import type {
  ProcessGateResult,
  ProcessInstanceView,
  ProcessRoleKey,
  ProcessTaskRow,
} from "./process";

export type NextActionKind =
  | "blocked"
  | "handover"
  | "task"
  | "gate"
  | "decision"
  | "ready"
  | "waiting"
  | "done"
  | "cancelled";

export interface NextAction {
  kind: NextActionKind;
  /** Imperative headline, e.g. "Attach the customer's confirmation". */
  title: string;
  /** One line of why / what unblocks it. */
  detail: string | null;
  /** Which task (if any) the headline points at. */
  taskId: string | null;
  /** Which gate (if any) is the blocker. */
  gateKey: string | null;
  /** How many required items are still open. */
  openRequired: number;
  /** Everything needed to press Complete stage is in place. */
  canComplete: boolean;
}

function firstOpenRequired(tasks: ProcessTaskRow[]): ProcessTaskRow | null {
  return (
    [...tasks]
      .sort((a, b) => a.sequence - b.sequence)
      .find((t) => t.required && t.status === "open") ?? null
  );
}

function firstBlocking(gates: ProcessGateResult[]): ProcessGateResult | null {
  return (
    gates.find((g) => g.status === "fail" || g.status === "unknown") ?? null
  );
}

export function deriveNextAction(view: ProcessInstanceView): NextAction {
  const { instance, current_stage: stage, tasks, gates, handover } = view;
  const openRequired = tasks.filter(
    (t) => t.required && t.status === "open",
  ).length;
  const base = {
    taskId: null,
    gateKey: null,
    openRequired,
    canComplete: false,
  };

  if (instance.status === "cancelled")
    return {
      ...base,
      kind: "cancelled",
      title: "This case was cancelled",
      detail: instance.cancel_reason ?? null,
    };
  if (instance.status === "completed" || !stage)
    return {
      ...base,
      kind: "done",
      title: "This case is complete",
      detail: null,
    };
  if (instance.status === "blocked")
    return {
      ...base,
      kind: "blocked",
      title: "Clear the exception to continue",
      detail:
        view.current_stage_instance?.blocked_reason?.message ??
        "Someone raised an exception on this stage.",
    };

  if (stage.stage_type === "HANDOVER") {
    if (!handover)
      return {
        ...base,
        kind: "handover",
        title: "Waiting for the handover package",
        detail: "Sales sends the package; the factory accepts or returns it.",
      };
    if (handover.status === "PENDING")
      return {
        ...base,
        kind: "handover",
        title: "Accept the handover or return it with an exception",
        detail: "Check stock, capacity, raw material and the delivery date.",
      };
    if (handover.status === "REJECTED")
      return {
        ...base,
        kind: "handover",
        title: "Handover was returned",
        detail: handover.rejection_comment ?? null,
      };
  }

  const task = firstOpenRequired(tasks);
  if (task)
    return {
      ...base,
      kind: "task",
      title: task.title,
      detail: task.evidence_required
        ? "Attach evidence, then tick it off."
        : openRequired > 1
          ? `${openRequired} required items left on this stage.`
          : "Last required item on this stage.",
      taskId: task.id,
    };

  const gate = firstBlocking(gates);
  if (gate) {
    if (gate.gate_type === "decision_outcome")
      return {
        ...base,
        kind: "decision",
        title: "Choose an outcome",
        detail: gate.message,
        gateKey: gate.gate_key,
      };
    return {
      ...base,
      kind: "gate",
      title: gate.message ?? "A gate is not satisfied yet",
      detail:
        gate.status === "unknown"
          ? "The system could not verify this yet. Try again shortly."
          : gate.overridable
            ? "Fix the cause, or a Managing Partner can override with a reason."
            : "This gate cannot be overridden.",
      gateKey: gate.gate_key,
    };
  }

  if (stage.stage_type === "WAIT")
    return {
      ...base,
      kind: "waiting",
      title: "Follow up, then move the case on",
      detail: "Record the outcome and complete the stage when ready.",
      canComplete: true,
    };

  return {
    ...base,
    kind: "ready",
    title: "Everything is in place — complete the stage",
    detail: null,
    canComplete: true,
  };
}

/** Whole-number progress for the journey track (completed / total). */
export function journeyProgress(view: ProcessInstanceView): {
  done: number;
  total: number;
  percent: number;
} {
  const steps = view.journey.filter(
    (s) => s.stage_type !== "END" && s.status !== "skipped",
  );
  const done = steps.filter((s) => s.status === "completed").length;
  const total = steps.length;
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

/** Human "due in 3 h" / "overdue by 2 d". */
export function describeDue(
  dueAt: string | null | undefined,
  now: Date = new Date(),
): { label: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  const span =
    minutes < 60
      ? `${Math.max(1, minutes)} min`
      : minutes < 60 * 24
        ? `${Math.round(minutes / 60)} h`
        : `${Math.round(minutes / (60 * 24))} d`;
  return diff < 0
    ? { label: `Overdue by ${span}`, overdue: true }
    : { label: `Due in ${span}`, overdue: false };
}

/**
 * One hue per owning role, shared by the web Process Map lanes, the case
 * progress track and the native journey so a colour means the same person
 * everywhere: indigo = Sales, teal = Finance, amber = Factory, violet = Partner.
 */
export interface ProcessLaneStyle {
  key: ProcessRoleKey;
  label: string;
  /** Solid hue for glyphs, borders and the lane rail. */
  hue: string;
  /** Deep hue for text on the wash. */
  deep: string;
  /** Wash for lane backgrounds and chips. */
  wash: string;
}

export const PROCESS_LANES: ProcessLaneStyle[] = [
  {
    key: "SALES_ENGINEER",
    label: "Sales",
    hue: "#4f46e5",
    deep: "#3730a3",
    wash: "#eef2ff",
  },
  {
    key: "FINANCE",
    label: "Finance",
    hue: "#0d9488",
    deep: "#115e59",
    wash: "#f0fdfa",
  },
  {
    key: "FACTORY_MANAGER",
    label: "Factory",
    hue: "#d97706",
    deep: "#92400e",
    wash: "#fffbeb",
  },
  {
    key: "MANAGING_PARTNER",
    label: "Partner",
    hue: "#7c3aed",
    deep: "#5b21b6",
    wash: "#f5f3ff",
  },
];

export function processLaneFor(role: ProcessRoleKey): ProcessLaneStyle {
  return PROCESS_LANES.find((l) => l.key === role) ?? PROCESS_LANES[0];
}
