/**
 * Process definition validator (PRD §33 "Definition validation").
 *
 * Pure: takes the authored JSON, returns structured issues. The zod schema
 * guarantees shape; this checks the GRAPH — the things a schema cannot see:
 * duplicate keys, dangling transitions, unreachable stages, one start stage,
 * cycles that are not marked as exceptions, gate references, and the
 * stage-type rules the runtime relies on.
 */
import {
  processDefinitionInputSchema,
  type ProcessDefinitionInput,
  type ProcessStageInput,
} from "@maiyuri/shared";
import type { ZodError } from "zod";

export type ValidationSeverity = "error" | "warning";

export interface DefinitionIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  stage_key?: string;
  path?: string;
}

export interface DefinitionValidation {
  ok: boolean;
  issues: DefinitionIssue[];
  definition: ProcessDefinitionInput | null;
}

function zodIssues(err: ZodError): DefinitionIssue[] {
  return err.errors.map((e) => ({
    code: "SCHEMA",
    severity: "error" as const,
    message: e.message,
    path: e.path.join("."),
  }));
}

/** Depth-first search for a cycle that uses only non-exception edges. */
function findNormalCycle(
  stages: ProcessStageInput[],
): { from: string; to: string } | null {
  const adj = new Map<string, string[]>();
  for (const s of stages) {
    adj.set(
      s.key,
      s.transitions.filter((t) => !t.is_exception).map((t) => t.to),
    );
  }
  const state = new Map<string, "visiting" | "done">();
  let found: { from: string; to: string } | null = null;

  const visit = (key: string): void => {
    if (found) return;
    state.set(key, "visiting");
    for (const next of adj.get(key) ?? []) {
      const st = state.get(next);
      if (st === "visiting") {
        found = { from: key, to: next };
        return;
      }
      if (!st && adj.has(next)) visit(next);
    }
    state.set(key, "done");
  };

  for (const s of stages) if (!state.has(s.key)) visit(s.key);
  return found;
}

function reachableFrom(
  start: string,
  stages: ProcessStageInput[],
): Set<string> {
  const adj = new Map(
    stages.map((s) => [s.key, s.transitions.map((t) => t.to)]),
  );
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const key = queue.shift() as string;
    for (const next of adj.get(key) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Validate an authored definition. `ok` is false when any error-severity
 * issue exists; warnings never block import.
 */
export function validateDefinition(input: unknown): DefinitionValidation {
  const parsed = processDefinitionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: zodIssues(parsed.error), definition: null };
  }
  const def = parsed.data;
  const issues: DefinitionIssue[] = [];
  const err = (code: string, message: string, stage_key?: string) =>
    issues.push({ code, severity: "error", message, stage_key });
  const warn = (code: string, message: string, stage_key?: string) =>
    issues.push({ code, severity: "warning", message, stage_key });

  const keys = new Set<string>();
  for (const s of def.stages) {
    if (keys.has(s.key))
      err("DUPLICATE_STAGE_KEY", `Stage key ${s.key} is used twice`, s.key);
    keys.add(s.key);
  }

  const starts = def.stages.filter((s) => s.is_start);
  if (starts.length === 0)
    err("NO_START_STAGE", "Exactly one stage must be marked is_start");
  if (starts.length > 1)
    err(
      "MULTIPLE_START_STAGES",
      `Only one start stage allowed, found ${starts.map((s) => s.key).join(", ")}`,
    );

  const ends = def.stages.filter((s) => s.type === "END");
  if (ends.length === 0)
    err("NO_END_STAGE", "A process needs at least one END stage");

  for (const s of def.stages) {
    // ---- transitions
    const tKeys = new Set<string>();
    for (const t of s.transitions) {
      if (tKeys.has(t.key))
        err(
          "DUPLICATE_TRANSITION_KEY",
          `Transition ${t.key} on ${s.key} is duplicated`,
          s.key,
        );
      tKeys.add(t.key);
      if (!keys.has(t.to))
        err(
          "MISSING_TRANSITION_TARGET",
          `${s.key} → ${t.to}: target stage does not exist`,
          s.key,
        );
      if (t.to === s.key && !t.is_exception)
        err(
          "SELF_TRANSITION",
          `${s.key} points to itself without is_exception`,
          s.key,
        );
      for (const g of t.condition.gates ?? []) {
        if (!s.gates.some((gate) => gate.key === g))
          err(
            "MISSING_GATE_REFERENCE",
            `Transition ${t.key} on ${s.key} references unknown gate ${g}`,
            s.key,
          );
      }
      if (t.condition.outcome && s.type !== "DECISION")
        warn(
          "OUTCOME_ON_NON_DECISION",
          `Transition ${t.key} on ${s.key} has an outcome but the stage is ${s.type}`,
          s.key,
        );
    }

    // ---- stage type rules
    if (s.type === "END") {
      if (s.transitions.length > 0)
        err(
          "END_HAS_TRANSITIONS",
          `END stage ${s.key} must not have transitions`,
          s.key,
        );
    } else {
      const normal = s.transitions.filter((t) => !t.is_exception);
      if (normal.length === 0)
        err(
          "DEAD_END",
          `${s.key} has no non-exception transition and is not END`,
          s.key,
        );
      if (s.type !== "DECISION" && normal.length > 1)
        err(
          "AMBIGUOUS_NEXT",
          `${s.key} has ${normal.length} normal transitions; only DECISION stages may branch`,
          s.key,
        );
    }
    if (s.type === "DECISION") {
      const outcomes = s.config.outcomes ?? [];
      if (outcomes.length === 0)
        err(
          "DECISION_WITHOUT_OUTCOMES",
          `DECISION stage ${s.key} needs config.outcomes`,
          s.key,
        );
      for (const o of outcomes) {
        if (!s.transitions.some((t) => t.condition.outcome === o))
          err(
            "OUTCOME_WITHOUT_TRANSITION",
            `Outcome ${o} of ${s.key} has no transition`,
            s.key,
          );
      }
      for (const t of s.transitions) {
        if (!t.is_exception && !t.condition.outcome)
          err(
            "DECISION_TRANSITION_WITHOUT_OUTCOME",
            `Transition ${t.key} on DECISION ${s.key} needs condition.outcome`,
            s.key,
          );
      }
      for (const o of s.config.outcomes_requiring_reason ?? []) {
        if (!outcomes.includes(o))
          err(
            "UNKNOWN_REASON_OUTCOME",
            `${s.key}: outcomes_requiring_reason has ${o} which is not an outcome`,
            s.key,
          );
      }
    }
    if (s.type === "HANDOVER") {
      if (!s.gates.some((g) => g.type === "handover_accepted"))
        err(
          "HANDOVER_WITHOUT_GATE",
          `HANDOVER stage ${s.key} needs a handover_accepted gate`,
          s.key,
        );
      if (!s.transitions.some((t) => t.is_exception))
        err(
          "HANDOVER_WITHOUT_RETURN",
          `HANDOVER stage ${s.key} needs an is_exception transition for rejection`,
          s.key,
        );
    }

    // ---- checklist + gates
    const cKeys = new Set<string>();
    for (const c of s.checklist) {
      if (cKeys.has(c.key))
        err(
          "DUPLICATE_CHECKLIST_KEY",
          `Checklist item ${c.key} on ${s.key} is duplicated`,
          s.key,
        );
      cKeys.add(c.key);
    }
    const gKeys = new Set<string>();
    for (const g of s.gates) {
      if (gKeys.has(g.key))
        err(
          "DUPLICATE_GATE_KEY",
          `Gate ${g.key} on ${s.key} is duplicated`,
          s.key,
        );
      gKeys.add(g.key);
      if (g.type === "decision_outcome" && s.type !== "DECISION")
        err(
          "DECISION_GATE_ON_NON_DECISION",
          `Gate ${g.key} on ${s.key} is decision_outcome but the stage is ${s.type}`,
          s.key,
        );
      if (g.type === "handover_accepted" && s.type !== "HANDOVER")
        err(
          "HANDOVER_GATE_ON_NON_HANDOVER",
          `Gate ${g.key} on ${s.key} needs a HANDOVER stage`,
          s.key,
        );
      if (g.type === "manual_confirmation" && !g.condition.evidence_type)
        warn(
          "MANUAL_GATE_WITHOUT_EVIDENCE_TYPE",
          `Gate ${g.key} on ${s.key} defaults to evidence_type "note"`,
          s.key,
        );
    }
    if (
      s.checklist.some((c) => c.required) &&
      !s.gates.some((g) => g.type === "checklist_complete")
    )
      warn(
        "CHECKLIST_WITHOUT_GATE",
        `${s.key} has required checklist items; the engine enforces them, but add a checklist_complete gate to show it on the map`,
        s.key,
      );
    if (s.sla_minutes === null && s.type !== "END" && s.type !== "WAIT")
      warn(
        "NO_SLA",
        `${s.key} has no SLA; it will never warn or breach`,
        s.key,
      );
  }

  // ---- reachability + cycles (only once keys are consistent)
  if (starts.length === 1) {
    const reachable = reachableFrom(starts[0].key, def.stages);
    for (const s of def.stages) {
      if (!reachable.has(s.key))
        err(
          "UNREACHABLE_STAGE",
          `${s.key} cannot be reached from ${starts[0].key}`,
          s.key,
        );
    }
    const endReachable = ends.some((e) => reachable.has(e.key));
    if (ends.length > 0 && !endReachable)
      err("END_UNREACHABLE", "No END stage is reachable from the start stage");
  }
  const cycle = findNormalCycle(def.stages);
  if (cycle)
    err(
      "CIRCULAR_TRANSITIONS",
      `${cycle.from} → ${cycle.to} closes a loop of normal transitions; mark the backward edge is_exception`,
      cycle.from,
    );

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    definition: def,
  };
}
