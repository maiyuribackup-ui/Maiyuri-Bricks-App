/**
 * Process OS reads + the RPC bridge. All writes go through the plpgsql
 * functions (see the migration header for why); this module only reads and
 * translates raised `CODE: message` errors into ProcessError.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  ProcessChecklistItemRow,
  ProcessDefinitionRow,
  ProcessDefinitionView,
  ProcessEventRow,
  ProcessEvidenceRow,
  ProcessGateRow,
  ProcessHandoverRow,
  ProcessInstanceRow,
  ProcessRoleDefaultRow,
  ProcessRoleKey,
  ProcessStageInstanceRow,
  ProcessStageRow,
  ProcessStageView,
  ProcessTaskRow,
  ProcessTransitionRow,
  ProcessVersionRow,
} from "@maiyuri/shared";
import { ProcessError, processErrorFromMessage } from "./errors";

export type EvidenceWithRole = ProcessEvidenceRow & {
  added_by_role?: string | null;
};

/** Call an engine function; raised errors become typed ProcessErrors. */
export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) throw processErrorFromMessage(error.message);
  return data as T;
}

// ------------------------------------------------------------ definitions --

export async function getDefinitionRow(
  key: string,
): Promise<ProcessDefinitionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_definitions")
    .select("*")
    .eq("process_key", key)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessDefinitionRow | null) ?? null;
}

export async function getVersion(
  versionId: string,
): Promise<ProcessVersionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessVersionRow | null) ?? null;
}

export async function listVersions(
  definitionId: string,
): Promise<ProcessVersionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("process_versions")
    .select("*")
    .eq("process_definition_id", definitionId)
    .order("created_at", { ascending: false });
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as ProcessVersionRow[];
}

/** Stages of one version with their checklist, gates and transitions. */
export async function getVersionStages(
  versionId: string,
): Promise<ProcessStageView[]> {
  const [stagesRes, transRes] = await Promise.all([
    supabaseAdmin
      .from("process_stages")
      .select("*, checklist:process_checklist_items(*), gates:process_gates(*)")
      .eq("process_version_id", versionId)
      .order("sequence"),
    supabaseAdmin
      .from("process_transitions")
      .select("*")
      .eq("process_version_id", versionId)
      .order("priority"),
  ]);
  if (stagesRes.error)
    throw new ProcessError("PROCESS_ERROR", stagesRes.error.message, 500);
  if (transRes.error)
    throw new ProcessError("PROCESS_ERROR", transRes.error.message, 500);
  const transitions = (transRes.data ?? []) as ProcessTransitionRow[];
  return (
    (stagesRes.data ?? []) as (ProcessStageRow & {
      checklist: ProcessChecklistItemRow[];
      gates: ProcessGateRow[];
    })[]
  ).map((s) => ({
    ...s,
    checklist: [...(s.checklist ?? [])].sort((a, b) => a.sequence - b.sequence),
    gates: [...(s.gates ?? [])].sort((a, b) =>
      a.gate_key.localeCompare(b.gate_key),
    ),
    transitions: transitions.filter((t) => t.from_stage_id === s.id),
  }));
}

function toDefinitionView(
  row: ProcessDefinitionRow,
  version: ProcessVersionRow | null,
  stages: ProcessStageView[],
): ProcessDefinitionView {
  return {
    ...row,
    version,
    stages,
    stage_count: stages.length,
    owner_roles: [
      ...new Set(stages.map((s) => s.owner_role)),
    ] as ProcessRoleKey[],
  };
}

export async function getDefinitionView(
  key: string,
  version?: string | null,
): Promise<ProcessDefinitionView | null> {
  const row = await getDefinitionRow(key);
  if (!row) return null;
  let ver: ProcessVersionRow | null = null;
  if (version) {
    const { data } = await supabaseAdmin
      .from("process_versions")
      .select("*")
      .eq("process_definition_id", row.id)
      .eq("version", version)
      .maybeSingle();
    ver = (data as ProcessVersionRow | null) ?? null;
    if (!ver)
      throw new ProcessError(
        "VERSION_NOT_FOUND",
        `${key} v${version} does not exist`,
      );
  } else if (row.active_version_id) {
    ver = await getVersion(row.active_version_id);
  }
  const stages = ver ? await getVersionStages(ver.id) : [];
  return toDefinitionView(row, ver, stages);
}

export async function listDefinitionViews(): Promise<ProcessDefinitionView[]> {
  const { data, error } = await supabaseAdmin
    .from("process_definitions")
    .select("*")
    .order("category")
    .order("name");
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  const rows = (data ?? []) as ProcessDefinitionRow[];
  const versionIds = rows
    .map((r) => r.active_version_id)
    .filter((v): v is string => !!v);
  const [versionsRes, stagesRes] = await Promise.all([
    versionIds.length
      ? supabaseAdmin.from("process_versions").select("*").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? supabaseAdmin
          .from("process_stages")
          .select("*")
          .in("process_version_id", versionIds)
          .order("sequence")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const versions = new Map(
    ((versionsRes.data ?? []) as ProcessVersionRow[]).map((v) => [v.id, v]),
  );
  const stagesByVersion = new Map<string, ProcessStageRow[]>();
  for (const s of (stagesRes.data ?? []) as ProcessStageRow[]) {
    const list = stagesByVersion.get(s.process_version_id) ?? [];
    list.push(s);
    stagesByVersion.set(s.process_version_id, list);
  }
  return rows.map((r) => {
    const ver = r.active_version_id
      ? (versions.get(r.active_version_id) ?? null)
      : null;
    const stages = (ver ? (stagesByVersion.get(ver.id) ?? []) : []).map(
      (s) => ({ ...s, checklist: [], gates: [], transitions: [] }),
    );
    return toDefinitionView(r, ver, stages);
  });
}

export async function getRoleDefaults(): Promise<ProcessRoleDefaultRow[]> {
  const { data, error } = await supabaseAdmin
    .from("process_role_defaults")
    .select("*");
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as ProcessRoleDefaultRow[];
}

export async function setRoleDefault(
  roleKey: ProcessRoleKey,
  userId: string | null,
  actorId: string,
): Promise<void> {
  if (userId === null) {
    const { error } = await supabaseAdmin
      .from("process_role_defaults")
      .delete()
      .eq("role_key", roleKey);
    if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
    return;
  }
  const { error } = await supabaseAdmin
    .from("process_role_defaults")
    .upsert(
      {
        role_key: roleKey,
        user_id: userId,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "role_key" },
    );
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
}

// -------------------------------------------------------------- instances --

export async function getInstance(
  id: string,
): Promise<ProcessInstanceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_instances")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessInstanceRow | null) ?? null;
}

export async function requireInstance(id: string): Promise<ProcessInstanceRow> {
  const inst = await getInstance(id);
  if (!inst)
    throw new ProcessError("INSTANCE_NOT_FOUND", "Process case not found");
  return inst;
}

export async function getLiveInstanceForEntity(
  entityType: string,
  entityId: string,
  processKey?: string,
): Promise<ProcessInstanceRow | null> {
  let q = supabaseAdmin
    .from("process_instances")
    .select("*, definition:process_definitions!inner(process_key)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .in("status", ["active", "blocked"])
    .order("started_at", { ascending: false })
    .limit(1);
  if (processKey) q = q.eq("definition.process_key", processKey);
  const { data, error } = await q;
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  const row = (data ?? [])[0] as
    | (ProcessInstanceRow & { definition?: unknown })
    | undefined;
  if (!row) return null;
  const { definition: _d, ...rest } = row;
  void _d;
  return rest as ProcessInstanceRow;
}

export async function listInstancesForEntity(
  entityType: string,
  entityId: string,
): Promise<ProcessInstanceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("process_instances")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("started_at", { ascending: false });
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as ProcessInstanceRow[];
}

export async function getStageInstance(
  id: string,
): Promise<ProcessStageInstanceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_stage_instances")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessStageInstanceRow | null) ?? null;
}

export async function listStageInstances(
  instanceId: string,
): Promise<ProcessStageInstanceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("process_stage_instances")
    .select("*")
    .eq("process_instance_id", instanceId)
    .order("started_at");
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as ProcessStageInstanceRow[];
}

export async function listTasks(
  stageInstanceId: string,
): Promise<ProcessTaskRow[]> {
  const { data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("*")
    .eq("stage_instance_id", stageInstanceId)
    .order("sequence");
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as ProcessTaskRow[];
}

export async function getTask(taskId: string): Promise<ProcessTaskRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessTaskRow | null) ?? null;
}

/** Evidence for a case, with the adder's app role (gates check who attached it). */
export async function listEvidence(
  instanceId: string,
  stageInstanceId?: string | null,
): Promise<EvidenceWithRole[]> {
  let q = supabaseAdmin
    .from("process_evidence")
    .select("*, adder:users!process_evidence_added_by_fkey(role)")
    .eq("process_instance_id", instanceId)
    .order("added_at");
  if (stageInstanceId) q = q.eq("stage_instance_id", stageInstanceId);
  const { data, error } = await q;
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (
    (data ?? []) as (ProcessEvidenceRow & {
      adder?: { role?: string } | null;
    })[]
  ).map((e) => {
    const { adder, ...rest } = e;
    return { ...rest, added_by_role: adder?.role ?? null };
  });
}

export async function getLatestHandover(
  stageInstanceId: string,
): Promise<ProcessHandoverRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_handovers")
    .select("*")
    .eq("stage_instance_id", stageInstanceId)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return ((data ?? [])[0] as ProcessHandoverRow | undefined) ?? null;
}

export async function getHandover(
  id: string,
): Promise<ProcessHandoverRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_handovers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessHandoverRow | null) ?? null;
}

/** Gate keys a Managing Partner has overridden on this stage instance. */
export async function listOverriddenGates(
  stageInstanceId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("process_events")
    .select("payload")
    .eq("stage_instance_id", stageInstanceId)
    .eq("event_type", "process.gate_overridden");
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  const keys = new Set<string>();
  for (const e of (data ?? []) as { payload: { gate_key?: string } }[]) {
    if (e.payload?.gate_key) keys.add(e.payload.gate_key);
  }
  return keys;
}

export async function listEvents(
  instanceId: string,
  limit = 200,
): Promise<ProcessEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("process_events")
    .select("*")
    .eq("process_instance_id", instanceId)
    .order("created_at")
    .limit(limit);
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as ProcessEventRow[];
}

export async function getStageRow(
  stageId: string,
): Promise<ProcessStageRow | null> {
  const { data, error } = await supabaseAdmin
    .from("process_stages")
    .select("*")
    .eq("id", stageId)
    .maybeSingle();
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data as ProcessStageRow | null) ?? null;
}

export async function getLeadForPermission(
  leadId: string,
): Promise<{
  assigned_staff: string | null;
  created_by: string | null;
} | null> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("assigned_staff, created_by")
    .eq("id", leadId)
    .maybeSingle();
  return (
    (data as {
      assigned_staff: string | null;
      created_by: string | null;
    } | null) ?? null
  );
}
