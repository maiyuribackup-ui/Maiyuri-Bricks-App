import type {
  ProcessEvidenceType,
  ProcessGateResult,
  ProcessInstanceView,
  ProcessStageType,
  ProcessStageView,
  ProcessTaskRow,
  ProcessTransitionRow,
} from "@maiyuri/shared";
import { PROCESS_ROLE_LABELS } from "@maiyuri/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  useAcceptHandover,
  useAddProcessEvidence,
  useAdvanceProcess,
  useBlockProcess,
  useCompleteProcessTask,
  useProcessDefinition,
  useRejectHandover,
  useUnblockProcess,
} from "@/hooks/use-process";
import { Button, Card, Icon, Touchable, type IconName } from "@/ui";
import {
  ChipRow,
  ExceptionSheet,
  HandoverFormSheet,
  NoteSheet,
  RejectHandoverSheet,
  SheetInput,
  payloadLabel,
} from "./ProcessSheets";

/**
 * The "My Work" execution panel for one process stage (PRD §7.3): context,
 * checklist, gates, decision outcome, and big primary actions. Everything a
 * factory or sales person needs to finish the stage without understanding
 * the engine.
 */

const STAGE_TYPE_STYLE: Record<
  ProcessStageType,
  { label: string; chip: string; text: string }
> = {
  ACTION: { label: "Action", chip: "bg-slate-100", text: "text-slate-700" },
  DECISION: { label: "Decision", chip: "bg-amber-50", text: "text-amber-700" },
  HANDOVER: { label: "Handover", chip: "bg-sky-50", text: "text-sky-700" },
  WAIT: { label: "Waiting", chip: "bg-slate-100", text: "text-slate-700" },
  AUTOMATION: {
    label: "Automatic",
    chip: "bg-purple-50",
    text: "text-purple-700",
  },
  END: { label: "End", chip: "bg-green-50", text: "text-green-700" },
};

const GATE_STYLE: Record<
  ProcessGateResult["status"],
  { icon: IconName; color: string; label: string }
> = {
  ok: { icon: "checkmark-circle", color: "#16a34a", label: "Passed" },
  fail: { icon: "close-circle", color: "#dc2626", label: "Not yet" },
  unknown: {
    icon: "help-circle-outline",
    color: "#94a3b8",
    label: "Checked on completion",
  },
  overridden: {
    icon: "shield-checkmark-outline",
    color: "#d97706",
    label: "Overridden",
  },
};

const CONTEXT_ROWS: { key: string; label: string }[] = [
  { key: "customer_name", label: "Customer" },
  { key: "product_name", label: "Product" },
  { key: "quantity", label: "Quantity" },
  { key: "requested_delivery_date", label: "Requested delivery" },
  { key: "odoo_order_name", label: "Order ref" },
  { key: "site_location", label: "Site" },
];

function fmtValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v.toLocaleString("en-IN");
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") return null;
  return String(v);
}

function humanKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function StageTypeBadge({ type }: { type: ProcessStageType }) {
  const s = STAGE_TYPE_STYLE[type] ?? STAGE_TYPE_STYLE.ACTION;
  return (
    <View className={`rounded-full px-2.5 py-1 ${s.chip}`}>
      <Text className={`text-xs font-semibold ${s.text}`}>{s.label}</Text>
    </View>
  );
}

function KeyValueRows({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <View className="mt-3 rounded-xl bg-canvas p-3">
      {rows.map((r, i) => (
        <View key={r.label} className={`flex-row ${i === 0 ? "" : "mt-1.5"}`}>
          <Text className="w-32 text-sm text-muted">{r.label}</Text>
          <Text className="flex-1 text-sm font-semibold text-ink">
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------- header ----------

function ContextHeader({ view }: { view: ProcessInstanceView }) {
  const stage = view.current_stage;
  const si = view.current_stage_instance;
  const ctx = view.instance.context ?? {};
  const rows = CONTEXT_ROWS.map((r) => ({
    label: r.label,
    value: fmtValue(ctx[r.key]),
  })).filter((r): r is { label: string; value: string } => r.value !== null);
  const isHandover = stage?.stage_type === "HANDOVER";
  const payloadRows = isHandover
    ? Object.entries(view.handover?.payload ?? {})
        .map(([k, v]) => ({ label: payloadLabel(k), value: fmtValue(v) }))
        .filter((r): r is { label: string; value: string } => r.value !== null)
    : [];
  const overdue = !!si?.due_at && new Date(si.due_at).getTime() < Date.now();

  return (
    <View>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
            {view.definition.name} · v{view.version.version}
          </Text>
          <Text className="mt-1 text-xl font-bold text-ink">
            {stage?.name ?? "Process complete"}
          </Text>
        </View>
        {stage ? <StageTypeBadge type={stage.stage_type} /> : null}
      </View>
      {stage ? (
        <Text className="mt-1 text-sm text-muted">
          {PROCESS_ROLE_LABELS[stage.owner_role] ?? stage.owner_role}
          {si?.due_at
            ? ` · due ${new Date(si.due_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </Text>
      ) : null}
      {overdue ? (
        <View className="mt-2 flex-row items-center gap-1.5 self-start rounded-full bg-red-50 px-2.5 py-1">
          <Icon name="time-outline" size={14} color="#dc2626" />
          <Text className="text-xs font-semibold text-red-600">
            SLA overdue
          </Text>
        </View>
      ) : null}
      {stage?.description ? (
        <Text className="mt-2 text-sm leading-5 text-slate-600">
          {stage.description}
        </Text>
      ) : null}
      <KeyValueRows rows={rows} />
      {payloadRows.length ? (
        <>
          <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
            Handover package
          </Text>
          <KeyValueRows rows={payloadRows} />
        </>
      ) : null}
    </View>
  );
}

// ---------- checklist ----------

function TaskRow({
  task,
  hasEvidence,
  disabled,
  busy,
  onToggle,
  onAddNote,
}: {
  task: ProcessTaskRow;
  hasEvidence: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
  onAddNote: () => void;
}) {
  const done = task.status === "done" || task.status === "na";
  const needsEvidence = task.evidence_required && !hasEvidence;
  return (
    <View className="mb-2 rounded-xl bg-canvas">
      <Touchable
        onPress={onToggle}
        onLongPress={done ? onToggle : undefined}
        disabled={disabled || busy}
        className="flex-row items-center px-3 py-3.5"
      >
        <Icon
          name={done ? "checkmark-circle" : "ellipse-outline"}
          size={26}
          color={done ? "#16a34a" : "#94a3b8"}
        />
        <View className="ml-3 flex-1">
          <Text
            className={`text-base ${done ? "text-muted line-through" : "font-medium text-ink"}`}
          >
            {task.title}
            {task.required && !done ? (
              <Text className="text-red-400"> *</Text>
            ) : null}
          </Text>
          {task.description && !done ? (
            <Text className="mt-0.5 text-xs text-muted">
              {task.description}
            </Text>
          ) : null}
          {task.status === "na" ? (
            <Text className="mt-0.5 text-xs text-muted">Not applicable</Text>
          ) : null}
        </View>
        {done && !disabled ? (
          <Text className="ml-2 text-xs font-semibold text-subtle">Undo</Text>
        ) : null}
      </Touchable>
      {task.evidence_required ? (
        <View className="flex-row items-center justify-between border-t border-line px-3 py-2">
          <View className="flex-row items-center gap-1.5">
            <Icon
              name={
                hasEvidence ? "document-attach-outline" : "alert-circle-outline"
              }
              size={15}
              color={hasEvidence ? "#16a34a" : "#b45309"}
            />
            <Text
              className={`text-xs font-semibold ${hasEvidence ? "text-green-700" : "text-amber-700"}`}
            >
              {hasEvidence ? "Evidence attached" : "Evidence required"}
            </Text>
          </View>
          {!disabled ? (
            <Touchable onPress={onAddNote} className="rounded-lg px-2.5 py-1.5">
              <Text className="text-xs font-bold text-brand">
                {needsEvidence ? "Add note" : "Add another"}
              </Text>
            </Touchable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------- gates ----------

function GateList({ gates }: { gates: ProcessGateResult[] }) {
  if (gates.length === 0) return null;
  return (
    <View className="mt-5">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Before this stage can close
      </Text>
      {gates.map((g) => {
        const s = GATE_STYLE[g.status] ?? GATE_STYLE.unknown;
        return (
          <View key={g.gate_key} className="mb-1.5 flex-row items-start">
            <Icon name={s.icon} size={20} color={s.color} />
            <View className="ml-2 flex-1">
              <Text className="text-sm font-medium text-ink">
                {humanKey(g.gate_key)}
              </Text>
              <Text className="text-xs text-muted">
                {g.status === "fail" && g.message ? g.message : s.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------- helpers for the primary action ----------

type ActionTarget = {
  transition: ProcessTransitionRow | null;
  target: ProcessStageView | null;
};

/**
 * The transition "Complete stage" will take: for a DECISION the edge whose
 * outcome matches; otherwise the single non-exception edge. The target stage
 * comes from the definition so we know when a handover form is needed.
 */
function resolveTarget(
  view: ProcessInstanceView,
  stages: ProcessStageView[] | undefined,
  outcome: string | null,
): ActionTarget {
  const edges = view.available_transitions.length
    ? view.available_transitions
    : (view.current_stage?.transitions ?? []);
  const normal = edges.filter((t) => !t.is_exception);
  const transition =
    view.current_stage?.stage_type === "DECISION"
      ? (normal.find((t) => t.condition?.outcome === outcome) ?? null)
      : (normal[0] ?? null);
  const target = transition
    ? (stages?.find((s) => s.id === transition.to_stage_id) ?? null)
    : null;
  return { transition, target };
}

// ---------- panel ----------

type Sheet =
  | { kind: "none" }
  | { kind: "exception" }
  | { kind: "reject" }
  | { kind: "handover"; fields: string[]; transitionKey?: string }
  | { kind: "note"; task: ProcessTaskRow };

export function ProcessStagePanel({ view }: { view: ProcessInstanceView }) {
  const router = useRouter();
  const stage = view.current_stage;
  const si = view.current_stage_instance;
  const instanceId = view.instance.id;
  const definition = useProcessDefinition(view.definition.process_key);
  const stages = definition.data?.data.stages;

  const completeTask = useCompleteProcessTask();
  const advance = useAdvanceProcess();
  const block = useBlockProcess();
  const unblock = useUnblockProcess();
  const accept = useAcceptHandover();
  const reject = useRejectHandover();
  const addEvidence = useAddProcessEvidence();

  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [outcome, setOutcome] = useState<string | null>(null);
  const [outcomeReason, setOutcomeReason] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const closeSheet = () => setSheet({ kind: "none" });

  if (!stage || !si) {
    return (
      <Card>
        <Text className="text-base font-bold text-ink">
          {view.instance.status === "completed"
            ? "Process complete"
            : "No active stage"}
        </Text>
        <Text className="mt-1 text-sm text-muted">
          This case is {view.instance.status}.
        </Text>
      </Card>
    );
  }

  const blocked = view.instance.status === "blocked";
  const canAct =
    view.can_act &&
    view.instance.status !== "completed" &&
    view.instance.status !== "cancelled";
  const busy =
    advance.isPending ||
    block.isPending ||
    unblock.isPending ||
    accept.isPending ||
    reject.isPending;
  const config = stage.configuration ?? {};
  const isDecision = stage.stage_type === "DECISION";
  const outcomes = config.outcomes ?? [];
  const reasonRequired =
    !!outcome && (config.outcomes_requiring_reason ?? []).includes(outcome);
  const pendingHandover =
    stage.stage_type === "HANDOVER" && view.handover?.status === "PENDING";
  const tasks = [...view.tasks].sort((a, b) => a.sequence - b.sequence);
  const evidenceByTask = new Set(
    view.evidence.map((e) => e.task_id).filter(Boolean),
  );
  const exceptionEdges = (
    view.available_transitions.length
      ? view.available_transitions
      : stage.transitions
  ).filter((t) => t.is_exception);

  const doAdvance = (
    extra: Partial<Parameters<typeof advance.mutate>[0]> = {},
  ) =>
    advance.mutate(
      {
        instanceId,
        expected_stage_instance_id: si.id,
        ...(isDecision && outcome
          ? { outcome, outcome_reason: outcomeReason.trim() || undefined }
          : {}),
        ...extra,
      },
      { onSuccess: closeSheet },
    );

  const onCompleteStage = () => {
    if (isDecision && !outcome) return;
    const { transition, target } = resolveTarget(view, stages, outcome);
    if (target?.stage_type === "HANDOVER") {
      const fields = target.configuration?.handover_payload_fields ?? [];
      setSheet({
        kind: "handover",
        fields,
        transitionKey: transition?.transition_key,
      });
      return;
    }
    doAdvance(transition ? { transition_key: transition.transition_key } : {});
  };

  const onExceptionEdge = (t: ProcessTransitionRow) => {
    const target = stages?.find((s) => s.id === t.to_stage_id) ?? null;
    if (target?.stage_type === "HANDOVER") {
      setSheet({
        kind: "handover",
        fields: target.configuration?.handover_payload_fields ?? [],
        transitionKey: t.transition_key,
      });
      return;
    }
    doAdvance({ transition_key: t.transition_key });
  };

  const onHelp = () => {
    if (config.sop_slug) router.push(`/onehub/sop/${config.sop_slug}` as never);
    else router.push("/onehub/ask" as never);
  };

  return (
    <Card>
      <ContextHeader view={view} />

      {blocked ? (
        <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <View className="flex-row items-center gap-1.5">
            <Icon name="alert-circle" size={18} color="#dc2626" />
            <Text className="text-xs font-bold uppercase tracking-wider text-red-600">
              Exception · {humanKey(si.blocked_reason?.code ?? "blocked")}
            </Text>
          </View>
          <Text className="mt-1 text-sm text-red-800">
            {si.blocked_reason?.message ?? "This stage is blocked."}
          </Text>
          {si.blocked_reason?.proposed_date ? (
            <Text className="mt-1 text-xs text-red-700">
              Proposed date: {si.blocked_reason.proposed_date}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!view.can_act ? (
        <View className="mt-3 flex-row items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2">
          <Icon name="lock-closed-outline" size={15} color="#64748b" />
          <Text className="flex-1 text-xs text-muted">
            This stage belongs to{" "}
            {PROCESS_ROLE_LABELS[si.assigned_role] ?? si.assigned_role}. You can
            view it but not act.
          </Text>
        </View>
      ) : null}

      {tasks.length ? (
        <View className="mt-5">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Complete now
          </Text>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              hasEvidence={evidenceByTask.has(t.id)}
              disabled={!canAct}
              busy={completeTask.isPending}
              onToggle={() =>
                completeTask.mutate({
                  taskId: t.id,
                  instanceId,
                  reopen: t.status !== "open",
                  status: "done",
                })
              }
              onAddNote={() => setSheet({ kind: "note", task: t })}
            />
          ))}
        </View>
      ) : null}

      <GateList gates={view.gates} />

      {isDecision && outcomes.length ? (
        <View className="mt-5">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Decision
          </Text>
          <ChipRow
            options={outcomes.map((o) => ({ key: o, label: humanKey(o) }))}
            value={outcome}
            onChange={setOutcome}
            disabled={!canAct}
          />
          {reasonRequired ? (
            <View className="mt-3">
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Reason <Text className="text-red-400">*</Text>
              </Text>
              <ReasonInput value={outcomeReason} onChange={setOutcomeReason} />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* primary actions */}
      <View className="mt-6 gap-3">
        {blocked ? (
          <Button
            size="lg"
            variant="dark"
            icon="lock-open-outline"
            label="Clear exception"
            loading={unblock.isPending}
            disabled={!canAct || busy}
            onPress={() =>
              unblock.mutate({ instanceId, expected_stage_instance_id: si.id })
            }
          />
        ) : pendingHandover && view.handover ? (
          <>
            <Button
              size="lg"
              variant="success"
              icon="checkmark-circle-outline"
              label="Accept Handover"
              loading={accept.isPending}
              disabled={!canAct || busy}
              onPress={() =>
                accept.mutate({
                  handoverId: view.handover?.id ?? "",
                  instanceId,
                  advance: true,
                })
              }
            />
            <Button
              size="lg"
              variant="outline"
              icon="arrow-undo-outline"
              label="Return with exception"
              disabled={!canAct || busy}
              onPress={() => setSheet({ kind: "reject" })}
            />
          </>
        ) : (
          <>
            <Button
              size="lg"
              variant="success"
              icon="checkmark-done-outline"
              label="Complete stage"
              loading={advance.isPending}
              disabled={
                !canAct ||
                busy ||
                (isDecision &&
                  (!outcome ||
                    (reasonRequired && outcomeReason.trim().length < 3)))
              }
              onPress={onCompleteStage}
            />
            <Button
              size="lg"
              variant="outline"
              icon="alert-circle-outline"
              label="Raise exception"
              disabled={!canAct || busy}
              onPress={() => setSheet({ kind: "exception" })}
            />
          </>
        )}
      </View>

      {/* secondary */}
      <View className="mt-4 flex-row items-center justify-between">
        <Touchable
          onPress={onHelp}
          className="flex-row items-center gap-1.5 rounded-lg px-2 py-2"
        >
          <Icon name="help-circle-outline" size={18} color="#f97316" />
          <Text className="text-sm font-semibold text-brand">
            How do I do this?
          </Text>
        </Touchable>
        {exceptionEdges.length && canAct ? (
          <Touchable
            onPress={() => setMoreOpen((v) => !v)}
            className="flex-row items-center gap-1 rounded-lg px-2 py-2"
          >
            <Text className="text-sm font-semibold text-muted">
              More options
            </Text>
            <Icon
              name={moreOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color="#64748b"
            />
          </Touchable>
        ) : null}
      </View>
      {moreOpen && canAct ? (
        <View className="mt-1 rounded-xl bg-canvas">
          {exceptionEdges.map((t, i) => (
            <Touchable
              key={t.id}
              disabled={busy}
              onPress={() => onExceptionEdge(t)}
              className={`flex-row items-center px-3 py-3.5 ${i === 0 ? "" : "border-t border-line"}`}
            >
              <Icon name="return-down-back-outline" size={18} color="#64748b" />
              <Text className="ml-3 flex-1 text-sm font-medium text-ink">
                {t.label ?? humanKey(t.transition_key)}
              </Text>
              <Icon name="chevron-forward" size={16} color="#94a3b8" />
            </Touchable>
          ))}
        </View>
      ) : null}

      {/* sheets */}
      <ExceptionSheet
        visible={sheet.kind === "exception"}
        onClose={closeSheet}
        busy={block.isPending}
        onSubmit={(form) =>
          block.mutate(
            { instanceId, expected_stage_instance_id: si.id, ...form },
            { onSuccess: closeSheet },
          )
        }
      />
      <RejectHandoverSheet
        visible={sheet.kind === "reject"}
        onClose={closeSheet}
        busy={reject.isPending}
        onSubmit={(form) =>
          reject.mutate(
            { handoverId: view.handover?.id ?? "", instanceId, ...form },
            { onSuccess: closeSheet },
          )
        }
      />
      <HandoverFormSheet
        visible={sheet.kind === "handover"}
        onClose={closeSheet}
        fields={sheet.kind === "handover" ? sheet.fields : []}
        initial={view.instance.context ?? {}}
        busy={advance.isPending}
        onSubmit={(payload) =>
          doAdvance({
            handover: { payload },
            ...(sheet.kind === "handover" && sheet.transitionKey
              ? { transition_key: sheet.transitionKey }
              : {}),
          })
        }
      />
      <NoteSheet
        visible={sheet.kind === "note"}
        title={sheet.kind === "note" ? sheet.task.title : "Add note"}
        onClose={closeSheet}
        busy={addEvidence.isPending}
        onSubmit={(text) => {
          if (sheet.kind !== "note") return;
          const evidenceType =
            (sheet.task.metadata?.evidence_type as
              | ProcessEvidenceType
              | undefined) ?? "note";
          addEvidence.mutate(
            {
              instanceId,
              stage_instance_id: si.id,
              task_id: sheet.task.id,
              evidence_type: evidenceType,
              source_type: "text",
              metadata: { text },
            },
            { onSuccess: closeSheet },
          );
        }}
      />
    </Card>
  );
}

function ReasonInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (t: string) => void;
}) {
  return (
    <SheetInput
      value={value}
      onChangeText={onChange}
      placeholder="Why this outcome?"
      multiline
    />
  );
}
