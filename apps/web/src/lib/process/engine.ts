/**
 * Process OS engine — the service layer every route and AI tool calls.
 *
 * Responsibilities:
 *   * compose the view of a case (definition + current stage + tasks + gates);
 *   * evaluate the gates that need Odoo / ops-control facts BEFORE asking the
 *     database to transition (the RPC re-checks what it can see itself);
 *   * translate raised errors and record `process.gate_failed`;
 *   * dispatch the events each mutation produced (notifications, webhook).
 */
import type { AuthenticatedUser } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  AddProcessEvidenceInput,
  AdvanceProcessInput,
  BlockProcessInput,
  ProcessDefinitionInput,
  ProcessGateResult,
  ProcessInstanceRow,
  ProcessInstanceView,
  ProcessJourneyStep,
  ProcessStageInstanceRow,
  ProcessStageView,
  ProcessTaskRow,
  ProcessVersionRow,
  StartProcessInput,
} from "@maiyuri/shared";
import { DB_VERIFIED_GATE_TYPES } from "@maiyuri/shared";
import { ProcessError } from "./errors";
import { evaluateGates, firstBlockingGate, gateResultsPayload } from "./gates";
import { collectFacts, type FactSources } from "./facts";
import { dispatchPendingEvents } from "./events";
import { canActOnStage, canManageDefinitions } from "./permissions";
import * as repo from "./repository";
import { validateDefinition } from "./validate-definition";

export interface EngineOptions {
  /** Injected fact loaders (tests). */
  sources?: FactSources;
  /** Skip notification dispatch (tests / bulk import). */
  silent?: boolean;
}

async function afterMutation(
  instanceId: string,
  opts?: EngineOptions,
): Promise<void> {
  if (opts?.silent) return;
  try {
    await dispatchPendingEvents(instanceId);
  } catch (err) {
    console.error("[ProcessOS] event dispatch failed (ignored):", err);
  }
}

// ------------------------------------------------------------ definitions --

export async function importDefinition(
  raw: unknown,
  actor: AuthenticatedUser,
  publish = false,
): Promise<{
  version_id: string;
  version: ProcessVersionRow | null;
  issues: ReturnType<typeof validateDefinition>["issues"];
}> {
  if (!canManageDefinitions(actor.role))
    throw new ProcessError(
      "FORBIDDEN",
      "Only a Managing Partner may import process definitions",
    );
  const validation = validateDefinition(raw);
  if (!validation.ok || !validation.definition) {
    const first = validation.issues.find((i) => i.severity === "error");
    throw new ProcessError(
      "DEFINITION_INVALID",
      first ? `${first.code}: ${first.message}` : "Definition is invalid",
    );
  }
  const versionId = await repo.rpc<string>("process_import_definition", {
    p_def: validation.definition,
    p_actor: actor.id,
  });
  let version: ProcessVersionRow | null = null;
  if (publish)
    version = await repo.rpc<ProcessVersionRow>("process_publish_version", {
      p_version_id: versionId,
      p_actor: actor.id,
    });
  else version = await repo.getVersion(versionId);
  return { version_id: versionId, version, issues: validation.issues };
}

export async function publishVersion(
  versionId: string,
  actor: AuthenticatedUser,
): Promise<ProcessVersionRow> {
  return repo.rpc<ProcessVersionRow>("process_publish_version", {
    p_version_id: versionId,
    p_actor: actor.id,
  });
}

export async function retireVersion(
  versionId: string,
  actor: AuthenticatedUser,
): Promise<ProcessVersionRow> {
  return repo.rpc<ProcessVersionRow>("process_retire_version", {
    p_version_id: versionId,
    p_actor: actor.id,
  });
}

/** Seed / upgrade a built-in definition when its version is not yet present. */
export async function ensureDefinition(
  def: ProcessDefinitionInput,
  actor: AuthenticatedUser,
): Promise<"exists" | "imported"> {
  const row = await repo.getDefinitionRow(def.process_key);
  if (row) {
    const versions = await repo.listVersions(row.id);
    if (versions.some((v) => v.version === def.version)) return "exists";
  }
  await importDefinition(def, actor, true);
  return "imported";
}

// ------------------------------------------------------------ view --------

function journeyFor(
  stages: ProcessStageView[],
  stageInstances: ProcessStageInstanceRow[],
  instance: ProcessInstanceRow,
): ProcessJourneyStep[] {
  const latestByStage = new Map<string, ProcessStageInstanceRow>();
  for (const si of stageInstances) {
    const prev = latestByStage.get(si.process_stage_id);
    if (!prev || si.started_at > prev.started_at)
      latestByStage.set(si.process_stage_id, si);
  }
  const terminal =
    instance.status === "completed" || instance.status === "cancelled";
  return stages
    .filter(
      (s) =>
        !(
          s.stage_type === "END" &&
          !latestByStage.has(s.id) &&
          stages.filter((x) => x.stage_type === "END").length > 1
        ),
    )
    .map((s) => {
      const si = latestByStage.get(s.id);
      let status: ProcessJourneyStep["status"] =
        si?.status ?? (terminal ? "skipped" : "upcoming");
      if (
        si &&
        si.id === instance.current_stage_instance_id &&
        instance.status === "blocked"
      )
        status = "blocked";
      return {
        stage_id: s.id,
        stage_key: s.stage_key,
        name: s.name,
        sequence: s.sequence,
        owner_role: s.owner_role,
        stage_type: s.stage_type,
        status,
        stage_instance_id: si?.id ?? null,
        due_at: si?.due_at ?? null,
      };
    });
}

interface LoadedCase {
  instance: ProcessInstanceRow;
  stages: ProcessStageView[];
  currentStage: ProcessStageView | null;
  stageInstance: ProcessStageInstanceRow | null;
  tasks: ProcessTaskRow[];
  evidence: repo.EvidenceWithRole[];
  handover: Awaited<ReturnType<typeof repo.getLatestHandover>>;
  overridden: Set<string>;
  stageInstances: ProcessStageInstanceRow[];
  version: ProcessVersionRow | null;
  roleDefaults: Partial<Record<string, string>>;
}

async function loadCase(instanceId: string): Promise<LoadedCase> {
  const instance = await repo.requireInstance(instanceId);
  const [stages, stageInstances, version, roleDefaults] = await Promise.all([
    repo.getVersionStages(instance.process_version_id),
    repo.listStageInstances(instance.id),
    repo.getVersion(instance.process_version_id),
    repo.loadRoleDefaultsMap(),
  ]);
  const stageInstance =
    stageInstances.find((s) => s.id === instance.current_stage_instance_id) ??
    null;
  const currentStage = stageInstance
    ? (stages.find((s) => s.id === stageInstance.process_stage_id) ?? null)
    : null;
  const [tasks, evidence, handover, overridden] = stageInstance
    ? await Promise.all([
        repo.listTasks(stageInstance.id),
        repo.listEvidence(instance.id, stageInstance.id),
        repo.getLatestHandover(stageInstance.id),
        repo.listOverriddenGates(stageInstance.id),
      ])
    : [[], [], null, new Set<string>()];
  return {
    instance,
    stages,
    currentStage,
    stageInstance,
    tasks,
    evidence,
    handover,
    overridden,
    stageInstances,
    version,
    roleDefaults,
  };
}

async function gateResultsFor(
  c: LoadedCase,
  outcome: string | null,
  sources?: FactSources,
): Promise<ProcessGateResult[]> {
  if (!c.currentStage || !c.stageInstance) return [];
  const facts = await collectFacts(
    {
      instance: c.instance,
      stageInstance: c.stageInstance,
      gates: c.currentStage.gates,
      tasks: c.tasks,
      evidence: c.evidence,
      handover: c.handover,
      overridden: c.overridden,
      outcome,
      roleDefaults: c.roleDefaults,
    },
    sources,
  );
  return evaluateGates(c.currentStage.gates, facts);
}

export async function getInstanceView(
  instanceId: string,
  actor?: AuthenticatedUser | null,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  const c = await loadCase(instanceId);
  const definition = await supabaseAdmin
    .from("process_definitions")
    .select("id, process_key, name, category")
    .eq("id", c.instance.process_definition_id)
    .single();
  const gates = await gateResultsFor(
    c,
    c.stageInstance?.outcome ?? null,
    opts?.sources,
  );
  const lead =
    actor && c.instance.entity_type === "lead"
      ? await repo.getLeadForPermission(c.instance.entity_id)
      : null;
  const canAct =
    !!actor &&
    !!c.stageInstance &&
    (c.instance.status === "active" || c.instance.status === "blocked") &&
    canActOnStage(actor, c.stageInstance, lead, c.roleDefaults);
  return {
    instance: c.instance,
    definition: (definition.data ?? {
      id: c.instance.process_definition_id,
      process_key: "",
      name: "",
      category: "SALES",
    }) as ProcessInstanceView["definition"],
    version: {
      id: c.instance.process_version_id,
      version: c.version?.version ?? "?",
    },
    current_stage: c.currentStage,
    current_stage_instance: c.stageInstance,
    tasks: c.tasks,
    gates,
    handover: c.handover,
    evidence: c.evidence,
    journey: journeyFor(c.stages, c.stageInstances, c.instance),
    available_transitions: c.currentStage?.transitions ?? [],
    can_act: canAct,
  };
}

export async function getViewForEntity(
  entityType: string,
  entityId: string,
  actor?: AuthenticatedUser | null,
): Promise<ProcessInstanceView | null> {
  const inst = await repo.getLiveInstanceForEntity(entityType, entityId);
  if (!inst) {
    const all = await repo.listInstancesForEntity(entityType, entityId);
    if (all.length === 0) return null;
    return getInstanceView(all[0].id, actor);
  }
  return getInstanceView(inst.id, actor);
}

// ------------------------------------------------------------ mutations ---

export async function startProcess(
  input: StartProcessInput,
  actor: AuthenticatedUser,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  const row = await repo.rpc<ProcessInstanceRow>("process_start", {
    p_process_key: input.process_key,
    p_entity_type: input.entity_type,
    p_entity_id: input.entity_id,
    p_actor: actor.id,
    p_context: input.context ?? {},
    p_start_stage_key: input.start_stage_key ?? null,
    p_imported: input.imported_existing_case ?? false,
    p_import_source: input.import_source ?? null,
    p_assignee: input.assigned_user_id ?? null,
  });
  if (input.entity_type === "lead")
    await syncContextFromLead(row.id, input.entity_id);
  await afterMutation(row.id, opts);
  return getInstanceView(row.id, actor, opts);
}

/** Keep the case header (customer, order) in step with the lead record. */
export async function syncContextFromLead(
  instanceId: string,
  leadId: string,
): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("name, phone, odoo_order_id, odoo_order_number, odoo_quote_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  const inst = await repo.getInstance(instanceId);
  if (!inst) return;
  const context = {
    ...inst.context,
    customer_name: inst.context.customer_name ?? lead.name ?? undefined,
    contact_phone: inst.context.contact_phone ?? lead.phone ?? undefined,
    odoo_order_id: lead.odoo_order_id ?? inst.context.odoo_order_id,
    odoo_order_name: lead.odoo_order_number ?? inst.context.odoo_order_name,
    odoo_quote_id: lead.odoo_quote_id ?? inst.context.odoo_quote_id,
  };
  await supabaseAdmin
    .from("process_instances")
    .update({ context })
    .eq("id", instanceId);
}

async function assertCanAct(
  actor: AuthenticatedUser,
  c: LoadedCase,
): Promise<void> {
  if (!c.stageInstance)
    throw new ProcessError(
      "INSTANCE_NOT_ACTIVE",
      `Case is ${c.instance.status}`,
    );
  const lead =
    c.instance.entity_type === "lead"
      ? await repo.getLeadForPermission(c.instance.entity_id)
      : null;
  if (!canActOnStage(actor, c.stageInstance, lead, c.roleDefaults)) {
    throw new ProcessError(
      "FORBIDDEN",
      `Only the ${c.stageInstance.assigned_role.replace(/_/g, " ").toLowerCase()} may act on this stage`,
    );
  }
}

export async function completeTask(
  taskId: string,
  actor: AuthenticatedUser,
  status: "done" | "na" | "open",
  note?: string,
  opts?: EngineOptions,
): Promise<ProcessTaskRow> {
  const task = await repo.rpc<ProcessTaskRow>("process_complete_task", {
    p_task_id: taskId,
    p_actor: actor.id,
    p_status: status,
    p_note: note ?? null,
  });
  const si = await repo.getStageInstance(task.stage_instance_id);
  if (si) await afterMutation(si.process_instance_id, opts);
  return task;
}

export async function addEvidence(
  instanceId: string,
  actor: AuthenticatedUser,
  input: AddProcessEvidenceInput,
  opts?: EngineOptions,
) {
  const c = await loadCase(instanceId);
  const stageInstanceId =
    input.stage_instance_id ?? c.stageInstance?.id ?? null;
  // Evidence on the current stage needs stage rights; finance/factory
  // confirmations are role-checked by the gate that consumes them.
  if (stageInstanceId && stageInstanceId === c.stageInstance?.id) {
    const lead =
      c.instance.entity_type === "lead"
        ? await repo.getLeadForPermission(c.instance.entity_id)
        : null;
    const roleFits =
      c.stageInstance &&
      canActOnStage(actor, c.stageInstance, lead, c.roleDefaults);
    const financeOrFactory = ["FINANCE", "FACTORY_MANAGER"].some((k) =>
      canActOnStage(
        actor,
        { assigned_role: k as never, assigned_user_id: null },
        null,
        c.roleDefaults,
      ),
    );
    if (!roleFits && !financeOrFactory)
      throw new ProcessError(
        "FORBIDDEN",
        "You cannot attach evidence to this stage",
      );
  }
  const row = await repo.rpc("process_add_evidence", {
    p_instance_id: instanceId,
    p_stage_instance_id: stageInstanceId,
    p_task_id: input.task_id ?? null,
    p_actor: actor.id,
    p_evidence_type: input.evidence_type,
    p_source_type: input.source_type,
    p_source_id: input.source_id ?? null,
    p_path: input.path ?? null,
    p_metadata: input.metadata ?? {},
  });
  await afterMutation(instanceId, opts);
  return row;
}

async function logGateFailed(
  c: LoadedCase,
  actor: AuthenticatedUser,
  gate: ProcessGateResult,
): Promise<void> {
  await supabaseAdmin.from("process_events").insert({
    process_instance_id: c.instance.id,
    stage_instance_id: c.stageInstance?.id ?? null,
    event_type: "process.gate_failed",
    actor_type: "user",
    actor_id: actor.id,
    reason: gate.message,
    payload: {
      gate_key: gate.gate_key,
      gate_type: gate.gate_type,
      status: gate.status,
      stage_key: c.currentStage?.stage_key,
    },
  });
}

/**
 * Move the case to its next stage. External gates are evaluated here and
 * handed to the database, which re-checks the ones it can see itself.
 */
export async function advance(
  instanceId: string,
  actor: AuthenticatedUser,
  input: AdvanceProcessInput,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  const c0 = await loadCase(instanceId);
  if (c0.instance.entity_type === "lead")
    await syncContextFromLead(instanceId, c0.instance.entity_id);
  const c =
    c0.instance.entity_type === "lead" ? await loadCase(instanceId) : c0;
  await assertCanAct(actor, c);
  if (
    !c.stageInstance ||
    c.stageInstance.id !== input.expected_stage_instance_id
  ) {
    throw new ProcessError(
      "STALE_STAGE",
      "The case has moved on since you loaded it",
    );
  }

  const chosen = input.transition_key
    ? c.currentStage?.transitions.find(
        (t) => t.transition_key === input.transition_key,
      )
    : null;
  const isException = chosen?.is_exception ?? false;

  let results: ProcessGateResult[] = [];
  if (!isException) {
    results = await gateResultsFor(c, input.outcome ?? null, opts?.sources);
    const external = results.filter(
      (r) => !DB_VERIFIED_GATE_TYPES.includes(r.gate_type),
    );
    const blocking = firstBlockingGate(external);
    if (blocking) {
      await logGateFailed(c, actor, blocking);
      throw new ProcessError(
        "GATE_FAILED",
        blocking.message ?? `Gate ${blocking.gate_key} is not met`,
        422,
        blocking.gate_key,
      );
    }
  }

  try {
    await repo.rpc("process_advance", {
      p_instance_id: instanceId,
      p_expected_stage_instance_id: input.expected_stage_instance_id,
      p_actor: actor.id,
      p_transition_key: input.transition_key ?? null,
      p_gate_results: gateResultsPayload(results),
      p_outcome: input.outcome ?? null,
      p_outcome_reason: input.outcome_reason ?? null,
      p_handover: input.handover
        ? {
            to_user_id: input.handover.to_user_id ?? null,
            payload: input.handover.payload,
          }
        : null,
      p_linked_record: input.linked_record ?? null,
    });
  } catch (err) {
    if (err instanceof ProcessError && err.code === "GATE_FAILED") {
      const r = results.find((g) => g.gate_key === err.gateKey) ?? {
        gate_key: err.gateKey ?? "?",
        gate_type: "checklist_complete" as const,
        status: "fail" as const,
        message: err.message,
        overridable: true,
      };
      await logGateFailed(c, actor, r);
    }
    throw err;
  }
  await afterMutation(instanceId, opts);
  return getInstanceView(instanceId, actor, opts);
}

export async function block(
  instanceId: string,
  actor: AuthenticatedUser,
  input: BlockProcessInput,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  await repo.rpc("process_block", {
    p_instance_id: instanceId,
    p_expected_stage_instance_id: input.expected_stage_instance_id,
    p_actor: actor.id,
    p_reason: {
      code: input.code,
      message: input.message,
      proposed_date: input.proposed_date ?? null,
    },
  });
  await afterMutation(instanceId, opts);
  return getInstanceView(instanceId, actor, opts);
}

export async function unblock(
  instanceId: string,
  actor: AuthenticatedUser,
  expectedStageInstanceId: string,
  note?: string,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  await repo.rpc("process_unblock", {
    p_instance_id: instanceId,
    p_expected_stage_instance_id: expectedStageInstanceId,
    p_actor: actor.id,
    p_note: note ?? null,
  });
  await afterMutation(instanceId, opts);
  return getInstanceView(instanceId, actor, opts);
}

export async function cancel(
  instanceId: string,
  actor: AuthenticatedUser,
  reason: string,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  await repo.rpc("process_cancel", {
    p_instance_id: instanceId,
    p_actor: actor.id,
    p_reason: reason,
  });
  await afterMutation(instanceId, opts);
  return getInstanceView(instanceId, actor, opts);
}

export async function overrideGate(
  instanceId: string,
  actor: AuthenticatedUser,
  stageInstanceId: string,
  gateKey: string,
  reason: string,
  opts?: EngineOptions,
): Promise<ProcessInstanceView> {
  await repo.rpc("process_override_gate", {
    p_instance_id: instanceId,
    p_stage_instance_id: stageInstanceId,
    p_gate_key: gateKey,
    p_actor: actor.id,
    p_reason: reason,
  });
  await afterMutation(instanceId, opts);
  return getInstanceView(instanceId, actor, opts);
}

export async function listEventsForInstance(instanceId: string) {
  return repo.listEvents(instanceId);
}
