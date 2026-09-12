"use client";

/**
 * Stage execution panel (PRD §7.3). Everything a user needs to finish the
 * current stage without understanding the engine: case context, "Complete
 * now" checklist, gate status, and one or two big primary buttons.
 *
 * Reused by the My Work detail page and the case page; both pass the
 * instance view (and, when known, the version's stage definitions so we can
 * tell whether the next stage is a HANDOVER and needs a package).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Paperclip,
} from "lucide-react";
import {
  PROCESS_ROLE_LABELS,
  type ProcessEvidenceType,
  type ProcessHandoverPayload,
  type ProcessInstanceView,
  type ProcessStageView,
  type ProcessTaskRow,
  type ProcessTransitionRow,
} from "@maiyuri/shared";
import { useAuthStore } from "@/stores/authStore";
import {
  useAcceptHandover,
  useAddProcessEvidence,
  useAdvanceProcess,
  useBlockProcess,
  useCompleteProcessTask,
  useOverrideGate,
  useRejectHandover,
  useUnblockProcess,
} from "@/hooks/useProcess";
import { ProcessGateList, humanizeKey } from "./ProcessGateList";
import { formatSla } from "./ProcessStageCard";
import {
  BlockDialog,
  EvidenceDialog,
  HandoverPackageDialog,
  OverrideDialog,
  RejectHandoverDialog,
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./HandoverDialog";

export interface ProcessStagePanelProps {
  view: ProcessInstanceView;
  /** Stages of the instance's version — lets us detect HANDOVER targets. */
  stageDefs?: ProcessStageView[];
  /** Link to the full case page (shown when embedded in My Work). */
  caseHref?: string;
  className?: string;
}

const PARTNER_ROLES = ["founder", "owner"];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatContextValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key.endsWith("_date")) return formatDate(value);
  if (typeof value === "number") return value.toLocaleString("en-IN");
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Context rows shown in the header (PRD §7.3 example). */
const CONTEXT_FIELDS: { key: string; label: string }[] = [
  { key: "customer_name", label: "Customer" },
  { key: "product_name", label: "Product" },
  { key: "quantity", label: "Quantity" },
  { key: "requested_delivery_date", label: "Requested delivery" },
  { key: "odoo_order_name", label: "Order" },
  { key: "site_location", label: "Site" },
];

export function ProcessStagePanel({
  view,
  stageDefs,
  caseHref,
  className = "",
}: ProcessStagePanelProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const isPartner = PARTNER_ROLES.includes(user?.role ?? "");

  const {
    instance,
    current_stage: stage,
    current_stage_instance: stageInstance,
  } = view;
  const canAct =
    view.can_act &&
    instance.status !== "completed" &&
    instance.status !== "cancelled";
  const isBlocked = instance.status === "blocked";
  const stageConfig = stage?.configuration ?? {};
  const isDecision = stage?.stage_type === "DECISION";
  const isHandoverStage = stage?.stage_type === "HANDOVER";
  const outcomes = stageConfig.outcomes ?? [];
  const outcomesNeedingReason = stageConfig.outcomes_requiring_reason ?? [];

  const completeTask = useCompleteProcessTask();
  const advance = useAdvanceProcess();
  const block = useBlockProcess();
  const unblock = useUnblockProcess();
  const override = useOverrideGate();
  const acceptHandover = useAcceptHandover();
  const rejectHandover = useRejectHandover();
  const addEvidence = useAddProcessEvidence();

  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [overrideGateKey, setOverrideGateKey] = useState<string | null>(null);
  const [evidenceTask, setEvidenceTask] = useState<ProcessTaskRow | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<{
    transition: ProcessTransitionRow;
    fields: string[];
  } | null>(null);

  const busy =
    completeTask.isPending ||
    advance.isPending ||
    block.isPending ||
    unblock.isPending ||
    override.isPending ||
    acceptHandover.isPending ||
    rejectHandover.isPending ||
    addEvidence.isPending;

  const pendingHandover =
    view.handover?.status === "PENDING" ? view.handover : null;
  // Addressed to me: explicit user, or my role holds the receiving side and
  // I did not send it. The API still enforces this; we only decide what to show.
  const handoverForMe = useMemo(() => {
    if (!pendingHandover || !isHandoverStage) return false;
    if (pendingHandover.from_user_id && pendingHandover.from_user_id === userId)
      return false;
    if (pendingHandover.to_user_id)
      return pendingHandover.to_user_id === userId;
    return view.can_act;
  }, [pendingHandover, isHandoverStage, userId, view.can_act]);

  const normalTransitions = view.available_transitions.filter(
    (t) => !t.is_exception,
  );
  const exceptionTransitions = view.available_transitions.filter(
    (t) => t.is_exception,
  );

  const tasksSorted = useMemo(
    () => [...view.tasks].sort((a, b) => a.sequence - b.sequence),
    [view.tasks],
  );
  const openRequired = tasksSorted.filter(
    (t) => t.required && t.status === "open",
  ).length;
  const evidenceByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of view.evidence) {
      if (e.task_id) m.set(e.task_id, (m.get(e.task_id) ?? 0) + 1);
    }
    return m;
  }, [view.evidence]);

  const stageDefById = useMemo(() => {
    const m = new Map<string, ProcessStageView>();
    for (const s of stageDefs ?? []) m.set(s.id, s);
    return m;
  }, [stageDefs]);

  const sopHref = stageConfig.sop_slug ? `/onehub#sop-library` : "/knowledge";

  // ------------------------------------------------------------ actions

  const runTask = async (task: ProcessTaskRow, checked: boolean) => {
    if (!stageInstance) return;
    setError(null);
    try {
      await completeTask.mutateAsync({
        taskId: task.id,
        instanceId: instance.id,
        reopen: !checked,
        status: "done",
      });
    } catch (err) {
      setError(errorMessage(err, "Failed to update the task"));
    }
  };

  const pickTransition = (): ProcessTransitionRow | null => {
    if (isDecision && outcome) {
      const byOutcome = normalTransitions.find(
        (t) => t.condition?.outcome === outcome,
      );
      if (byOutcome) return byOutcome;
    }
    return normalTransitions[0] ?? null;
  };

  const doAdvance = async (
    transition: ProcessTransitionRow | null,
    handover?: { payload: ProcessHandoverPayload },
  ) => {
    if (!stageInstance) return;
    setError(null);
    try {
      await advance.mutateAsync({
        instanceId: instance.id,
        body: {
          expected_stage_instance_id: stageInstance.id,
          transition_key: transition?.transition_key,
          outcome: isDecision && outcome ? outcome : undefined,
          outcome_reason:
            isDecision && outcomeReason.trim()
              ? outcomeReason.trim()
              : undefined,
          handover,
        },
      });
      setHandoverTarget(null);
      setShowMore(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to complete the stage"));
    }
  };

  const handleCompleteStage = async () => {
    if (isDecision && outcomes.length > 0 && !outcome) {
      setError("Choose an outcome first.");
      return;
    }
    if (
      isDecision &&
      outcomesNeedingReason.includes(outcome) &&
      outcomeReason.trim().length === 0
    ) {
      setError("This outcome needs a reason.");
      return;
    }
    const transition = pickTransition();
    const target = transition
      ? stageDefById.get(transition.to_stage_id)
      : undefined;
    if (transition && target?.stage_type === "HANDOVER") {
      setHandoverTarget({
        transition,
        fields: target.configuration?.handover_payload_fields ?? [],
      });
      return;
    }
    await doAdvance(transition);
  };

  const handleException = async (transition: ProcessTransitionRow) => {
    const label = transition.label ?? humanizeKey(transition.transition_key);
    if (!window.confirm(`${label} — continue?`)) return;
    await doAdvance(transition);
  };

  const handleBlock = async (input: {
    code: string;
    message: string;
    proposed_date?: string;
  }) => {
    if (!stageInstance) return;
    setError(null);
    try {
      await block.mutateAsync({
        instanceId: instance.id,
        body: { expected_stage_instance_id: stageInstance.id, ...input },
      });
      setShowBlock(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to raise the exception"));
    }
  };

  const handleUnblock = async () => {
    if (!stageInstance) return;
    setError(null);
    try {
      await unblock.mutateAsync({
        instanceId: instance.id,
        body: { expected_stage_instance_id: stageInstance.id },
      });
    } catch (err) {
      setError(errorMessage(err, "Failed to clear the exception"));
    }
  };

  const handleOverride = async (reason: string) => {
    if (!stageInstance || !overrideGateKey) return;
    setError(null);
    try {
      await override.mutateAsync({
        instanceId: instance.id,
        body: {
          stage_instance_id: stageInstance.id,
          gate_key: overrideGateKey,
          reason,
        },
      });
      setOverrideGateKey(null);
    } catch (err) {
      setError(errorMessage(err, "Failed to override the gate"));
    }
  };

  const handleAccept = async () => {
    if (!pendingHandover) return;
    setError(null);
    try {
      await acceptHandover.mutateAsync({
        handoverId: pendingHandover.id,
        instanceId: instance.id,
        body: { advance: true },
      });
    } catch (err) {
      setError(errorMessage(err, "Failed to accept the handover"));
    }
  };

  const handleReject = async (
    input: Parameters<typeof rejectHandover.mutateAsync>[0]["body"],
  ) => {
    if (!pendingHandover) return;
    setError(null);
    try {
      await rejectHandover.mutateAsync({
        handoverId: pendingHandover.id,
        instanceId: instance.id,
        body: input,
      });
      setShowReject(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to return the handover"));
    }
  };

  const handleEvidence = async (input: {
    source_type: "text" | "url";
    value: string;
  }) => {
    if (!evidenceTask || !stageInstance) return;
    setError(null);
    const configured = evidenceTask.metadata?.evidence_type as
      | ProcessEvidenceType
      | undefined;
    const evidenceType: ProcessEvidenceType =
      configured ?? (input.source_type === "url" ? "link" : "note");
    try {
      await addEvidence.mutateAsync({
        instanceId: instance.id,
        body: {
          stage_instance_id: stageInstance.id,
          task_id: evidenceTask.id,
          evidence_type: evidenceType,
          source_type: input.source_type,
          path: input.source_type === "url" ? input.value : undefined,
          metadata: input.source_type === "text" ? { text: input.value } : {},
        },
      });
      setEvidenceTask(null);
    } catch (err) {
      setError(errorMessage(err, "Failed to attach the evidence"));
    }
  };

  // ------------------------------------------------------------ render

  if (!stage || !stageInstance) {
    return (
      <div
        className={`rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 ${className}`}
      >
        {instance.status === "completed"
          ? "This case is complete."
          : instance.status === "cancelled"
            ? `This case was cancelled${instance.cancel_reason ? `: ${instance.cancel_reason}` : "."}`
            : "No active stage."}
      </div>
    );
  }

  const contextRows = CONTEXT_FIELDS.filter(
    ({ key }) =>
      instance.context?.[key] !== undefined &&
      instance.context?.[key] !== null &&
      instance.context?.[key] !== "",
  );
  const payloadRows = pendingHandover
    ? Object.entries(pendingHandover.payload ?? {}).filter(
        ([, v]) => v !== null && v !== "" && v !== undefined,
      )
    : [];
  const sla = formatSla(stage.sla_minutes);
  const dueLabel = stageInstance.due_at
    ? formatDate(stageInstance.due_at)
    : null;

  return (
    <div className={`space-y-4 ${className}`} data-testid="process-stage-panel">
      {/* Header: stage + case context */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}
          </span>
          {stage.stage_type !== "ACTION" && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {humanizeKey(stage.stage_type)}
            </span>
          )}
          {isBlocked && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              ! Blocked
            </span>
          )}
          {stageInstance.sla_breached_at && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              Overdue
            </span>
          )}
        </div>
        <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
          {stage.name}
          {instance.context?.odoo_order_name ? (
            <span className="font-normal text-slate-400">
              {" "}
              — {String(instance.context.odoo_order_name)}
            </span>
          ) : null}
        </h2>
        {stage.description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {stage.description}
          </p>
        )}
        {contextRows.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {contextRows.map(({ key, label }) => (
              <div key={key} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                  {label}
                </dt>
                <dd className="truncate font-medium text-slate-800 dark:text-slate-100">
                  {formatContextValue(key, instance.context?.[key])}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {sla && <span>SLA {sla}</span>}
          {dueLabel && <span>Due {dueLabel}</span>}
          <Link
            href={sopHref}
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            <BookOpen className="h-3.5 w-3.5" /> How do I do this?
          </Link>
          {caseHref && (
            <Link
              href={caseHref}
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Full case
            </Link>
          )}
        </div>
      </section>

      {/* Blocked banner */}
      {isBlocked && stageInstance.blocked_reason && (
        <section
          role="status"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-300" />
            <div className="min-w-0 flex-1 text-sm text-rose-800 dark:text-rose-200">
              <p className="font-semibold">
                {humanizeKey(stageInstance.blocked_reason.code)}
              </p>
              <p>{stageInstance.blocked_reason.message}</p>
              {stageInstance.blocked_reason.proposed_date && (
                <p className="mt-1 text-xs">
                  Expected to clear by{" "}
                  {formatDate(stageInstance.blocked_reason.proposed_date)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleUnblock}
            disabled={!canAct || busy}
            className={`mt-3 ${secondaryButtonClass}`}
          >
            Clear exception
          </button>
        </section>
      )}

      {/* Handover package (receiver's view) */}
      {pendingHandover && payloadRows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Handover package
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            From{" "}
            {PROCESS_ROLE_LABELS[pendingHandover.from_role] ??
              pendingHandover.from_role}{" "}
            · {formatDate(pendingHandover.requested_at)}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {payloadRows.map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <th
                      scope="row"
                      className="w-40 py-1.5 pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      {humanizeKey(key)}
                    </th>
                    <td className="py-1.5 text-slate-800 dark:text-slate-100">
                      {formatContextValue(key, value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Complete now — checklist */}
      {tasksSorted.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Complete now
            </h3>
            <span className="text-xs text-slate-400">
              {openRequired === 0
                ? "All required done"
                : `${openRequired} required left`}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {tasksSorted.map((task) => {
              const checked = task.status !== "open";
              const evidenceCount = evidenceByTask.get(task.id) ?? 0;
              return (
                <li key={task.id} className="flex items-start gap-3 py-2.5">
                  <label className="flex min-h-[44px] flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canAct || busy || isBlocked}
                      onChange={(e) => runTask(task, e.target.checked)}
                      className="mt-1 h-5 w-5 flex-shrink-0 rounded border-slate-300 text-primary focus:ring-primary"
                      aria-label={task.title}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${
                          checked
                            ? "text-slate-400 line-through dark:text-slate-500"
                            : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {task.title}
                        {task.required && !checked && (
                          <span
                            className="ml-1 text-rose-500"
                            aria-label="required"
                          >
                            *
                          </span>
                        )}
                        {task.status === "na" && (
                          <span className="ml-1 text-[11px] uppercase text-slate-400">
                            n/a
                          </span>
                        )}
                      </span>
                      {task.description && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {task.description}
                        </span>
                      )}
                      {task.evidence_required && (
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          Evidence required
                          {evidenceCount > 0
                            ? ` · ${evidenceCount} attached`
                            : ""}
                        </span>
                      )}
                    </span>
                  </label>
                  {task.evidence_required && (
                    <button
                      type="button"
                      onClick={() => setEvidenceTask(task)}
                      disabled={!canAct || busy}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Paperclip className="h-3.5 w-3.5" /> Attach
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Gates */}
      {view.gates.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Before moving on
          </h3>
          <ProcessGateList
            gates={view.gates}
            disabled={busy}
            onOverride={
              isPartner
                ? (gate) => setOverrideGateKey(gate.gate_key)
                : undefined
            }
          />
        </section>
      )}

      {/* DECISION outcome */}
      {isDecision && outcomes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Outcome
          </h3>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Outcome"
          >
            {outcomes.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={outcome === o}
                disabled={!canAct || busy}
                onClick={() => setOutcome(o)}
                className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold disabled:opacity-50 ${
                  outcome === o
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"
                }`}
              >
                {humanizeKey(o)}
              </button>
            ))}
          </div>
          {outcomesNeedingReason.includes(outcome) && (
            <div className="mt-3">
              <label
                htmlFor="outcome-reason"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Reason (required)
              </label>
              <textarea
                id="outcome-reason"
                value={outcomeReason}
                onChange={(e) => setOutcomeReason(e.target.value)}
                rows={2}
                disabled={!canAct || busy}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
          )}
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      {!view.can_act && instance.status === "active" && (
        <p className="text-xs text-slate-400">
          This stage belongs to{" "}
          {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}. You can
          follow it here but not act on it.
        </p>
      )}

      {/* Primary actions */}
      <section className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {handoverForMe ? (
          <>
            <button
              type="button"
              onClick={handleAccept}
              disabled={!canAct || busy}
              className={primaryButtonClass}
            >
              <CheckCircle2 className="h-4 w-4" /> Accept Handover
            </button>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={!canAct || busy}
              className={dangerButtonClass}
            >
              Return with exception
            </button>
          </>
        ) : (
          <>
            {!isBlocked && (
              <button
                type="button"
                onClick={handleCompleteStage}
                disabled={!canAct || busy}
                className={primaryButtonClass}
              >
                <CheckCircle2 className="h-4 w-4" />{" "}
                {busy ? "Working…" : "Complete stage"}
              </button>
            )}
            {!isBlocked && (
              <button
                type="button"
                onClick={() => setShowBlock(true)}
                disabled={!canAct || busy}
                className={dangerButtonClass}
              >
                <AlertTriangle className="h-4 w-4" /> Raise exception
              </button>
            )}
          </>
        )}
        {exceptionTransitions.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              disabled={!canAct || busy}
              aria-haspopup="menu"
              aria-expanded={showMore}
              className={secondaryButtonClass}
            >
              More <ChevronDown className="h-4 w-4" />
            </button>
            {showMore && (
              <div
                role="menu"
                className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {exceptionTransitions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleException(t)}
                    className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {t.label ?? humanizeKey(t.transition_key)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Dialogs */}
      {showReject && (
        <RejectHandoverDialog
          isOpen
          onClose={() => setShowReject(false)}
          onSubmit={handleReject}
          busy={rejectHandover.isPending}
          error={error}
        />
      )}
      {showBlock && (
        <BlockDialog
          isOpen
          onClose={() => setShowBlock(false)}
          onSubmit={handleBlock}
          busy={block.isPending}
          error={error}
        />
      )}
      {overrideGateKey && (
        <OverrideDialog
          isOpen
          gateKey={overrideGateKey}
          onClose={() => setOverrideGateKey(null)}
          onSubmit={handleOverride}
          busy={override.isPending}
          error={error}
        />
      )}
      {evidenceTask && (
        <EvidenceDialog
          isOpen
          taskTitle={evidenceTask.title}
          onClose={() => setEvidenceTask(null)}
          onSubmit={handleEvidence}
          busy={addEvidence.isPending}
          error={error}
        />
      )}
      {handoverTarget && (
        <HandoverPackageDialog
          isOpen
          fields={handoverTarget.fields}
          context={instance.context ?? {}}
          onClose={() => setHandoverTarget(null)}
          onSubmit={(payload) =>
            doAdvance(handoverTarget.transition, { payload })
          }
          busy={advance.isPending}
          error={error}
        />
      )}
    </div>
  );
}
