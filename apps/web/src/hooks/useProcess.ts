/**
 * Process OS — TanStack Query hooks over /api/process/*.
 * Every route returns the `{ data, error }` envelope; API error strings are
 * surfaced verbatim so the UI can show "message [GATE_KEY]" style failures.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptHandoverInput,
  AddProcessEvidenceInput,
  AdvanceProcessInput,
  BlockProcessInput,
  CompleteProcessTaskInput,
  CreateHandoverInput,
  ImportDefinitionInput,
  OverrideGateInput,
  ProcessDefinitionInput,
  ProcessDefinitionView,
  ProcessEventRow,
  ProcessHandoverRow,
  ProcessInstanceView,
  ProcessQcReleaseRow,
  ProcessRoleDefaultRow,
  ProcessRoleKey,
  ProcessVersionRow,
  ProcessWorkQueue,
  RecordQcReleaseInput,
  RejectHandoverInput,
  SetRoleDefaultInput,
  StartProcessInput,
  UserRole,
} from "@maiyuri/shared";

interface ApiResponse<T> {
  data: T;
  error?: string;
}

export type ProcessDefinitionDetail = ProcessDefinitionView & {
  versions: ProcessVersionRow[];
};

export type ProcessHistoryEvent = ProcessEventRow & {
  actor_name: string | null;
};

export interface ProcessRoleDefaults {
  defaults: ProcessRoleDefaultRow[];
  users: { id: string; name: string; role: UserRole }[];
  role_map: Record<ProcessRoleKey, readonly UserRole[]>;
}

export interface DefinitionIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  stage_key?: string;
}

export interface ImportDryRunResult {
  ok: boolean;
  issues: DefinitionIssue[];
}

// ============================================
// Fetch helpers
// ============================================

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error ?? fallback);
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) await throwApiError(res, fallback);
  const body = (await res.json()) as ApiResponse<T>;
  return body.data;
}

async function sendJson<T>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  fallback: string,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, fallback);
  const parsed = (await res.json()) as ApiResponse<T>;
  return parsed.data;
}

// ============================================
// Query keys
// ============================================

export const processKeys = {
  definitions: ["process", "definitions"] as const,
  definition: (key: string, version?: string | null) =>
    ["process", "definition", key, version ?? "active"] as const,
  instance: (id: string) => ["process", "instance", id] as const,
  forEntity: (type: string, id: string) =>
    ["process", "for", type, id] as const,
  work: ["process", "work"] as const,
  history: (id: string) => ["process", "history", id] as const,
  roleDefaults: ["process", "role-defaults"] as const,
};

// ============================================
// Queries
// ============================================

export function useProcessDefinitions() {
  return useQuery({
    queryKey: processKeys.definitions,
    queryFn: () =>
      getJson<ProcessDefinitionView[]>(
        "/api/process/definitions",
        "Failed to load processes",
      ),
  });
}

export function useProcessDefinition(
  key: string | null,
  version?: string | null,
) {
  return useQuery({
    queryKey: processKeys.definition(key ?? "", version),
    queryFn: () => {
      const query = version ? `?version=${encodeURIComponent(version)}` : "";
      return getJson<ProcessDefinitionDetail>(
        `/api/process/definitions/${encodeURIComponent(key ?? "")}${query}`,
        "Failed to load the process",
      );
    },
    enabled: !!key,
  });
}

export function useProcessInstance(id: string | null) {
  return useQuery({
    queryKey: processKeys.instance(id ?? ""),
    queryFn: () =>
      getJson<ProcessInstanceView>(
        `/api/process/instances/${id}`,
        "Failed to load the case",
      ),
    enabled: !!id,
  });
}

export function useProcessForEntity(
  entityType: string | null,
  entityId: string | null,
) {
  return useQuery({
    queryKey: processKeys.forEntity(entityType ?? "", entityId ?? ""),
    queryFn: () =>
      getJson<ProcessInstanceView | null>(
        `/api/process/instances/for/${entityType}/${entityId}`,
        "Failed to load the case",
      ),
    enabled: !!entityType && !!entityId,
  });
}

export function useProcessWork(enabled = true) {
  return useQuery({
    queryKey: processKeys.work,
    queryFn: () =>
      getJson<ProcessWorkQueue>(
        "/api/process/work",
        "Failed to load your process work",
      ),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useProcessHistory(id: string | null) {
  return useQuery({
    queryKey: processKeys.history(id ?? ""),
    queryFn: () =>
      getJson<ProcessHistoryEvent[]>(
        `/api/process/instances/${id}/history`,
        "Failed to load the history",
      ),
    enabled: !!id,
  });
}

export function useProcessRoleDefaults(enabled = true) {
  return useQuery({
    queryKey: processKeys.roleDefaults,
    queryFn: () =>
      getJson<ProcessRoleDefaults>(
        "/api/process/role-defaults",
        "Failed to load role defaults",
      ),
    enabled,
  });
}

// ============================================
// Mutations
// ============================================

type QueryClientRef = ReturnType<typeof useQueryClient>;

/** Every state change touches the instance, the work queue and any journey strips. */
function invalidateInstance(qc: QueryClientRef, instanceId?: string | null) {
  qc.invalidateQueries({ queryKey: ["process", "work"] });
  qc.invalidateQueries({ queryKey: ["process", "for"] });
  qc.invalidateQueries({ queryKey: ["my-work"] });
  if (instanceId) {
    qc.invalidateQueries({ queryKey: processKeys.instance(instanceId) });
    qc.invalidateQueries({ queryKey: processKeys.history(instanceId) });
  } else {
    qc.invalidateQueries({ queryKey: ["process", "instance"] });
    qc.invalidateQueries({ queryKey: ["process", "history"] });
  }
}

export interface CompleteTaskArgs extends CompleteProcessTaskInput {
  taskId: string;
  instanceId: string;
  reopen?: boolean;
}

export function useCompleteProcessTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      instanceId: _i,
      reopen,
      ...body
    }: CompleteTaskArgs) =>
      sendJson<unknown>(
        `/api/process/tasks/${taskId}/complete${reopen ? "?reopen=1" : ""}`,
        "POST",
        body,
        reopen ? "Failed to reopen the task" : "Failed to complete the task",
      ),
    onSuccess: (_, { instanceId }) => invalidateInstance(qc, instanceId),
  });
}

interface InstanceArgs<T> {
  instanceId: string;
  body: T;
}

function useInstanceAction<T>(action: string, fallback: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, body }: InstanceArgs<T>) =>
      sendJson<ProcessInstanceView>(
        `/api/process/instances/${instanceId}/${action}`,
        "POST",
        body,
        fallback,
      ),
    onSuccess: (_, { instanceId }) => invalidateInstance(qc, instanceId),
  });
}

export function useAdvanceProcess() {
  return useInstanceAction<AdvanceProcessInput>(
    "advance",
    "Failed to complete the stage",
  );
}

export function useBlockProcess() {
  return useInstanceAction<BlockProcessInput>(
    "block",
    "Failed to raise the exception",
  );
}

export function useUnblockProcess() {
  return useInstanceAction<{
    expected_stage_instance_id: string;
    note?: string;
  }>("unblock", "Failed to clear the exception");
}

export function useCancelProcess() {
  return useInstanceAction<{ reason: string }>(
    "cancel",
    "Failed to cancel the case",
  );
}

export function useOverrideGate() {
  return useInstanceAction<OverrideGateInput>(
    "override",
    "Failed to override the gate",
  );
}

export function useAddProcessEvidence() {
  return useInstanceAction<AddProcessEvidenceInput>(
    "evidence",
    "Failed to attach the evidence",
  );
}

/** Record a QC release / hold on the current stage (Factory Manager). */
export function useRecordQcRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, body }: InstanceArgs<RecordQcReleaseInput>) =>
      sendJson<{ qc_release: ProcessQcReleaseRow; view: ProcessInstanceView }>(
        `/api/process/instances/${instanceId}/qc-release`,
        "POST",
        body,
        "Failed to record the QC release",
      ),
    onSuccess: (_, { instanceId }) => invalidateInstance(qc, instanceId),
  });
}

export interface HandoverActionArgs<T> {
  handoverId: string;
  instanceId: string;
  body: T;
}

export function useAcceptHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      handoverId,
      body,
    }: HandoverActionArgs<Partial<AcceptHandoverInput>>) =>
      sendJson<{
        handover: ProcessHandoverRow;
        view: ProcessInstanceView;
        advanced: boolean;
      }>(
        `/api/process/handovers/${handoverId}/accept`,
        "POST",
        body,
        "Failed to accept the handover",
      ),
    onSuccess: (_, { instanceId }) => invalidateInstance(qc, instanceId),
  });
}

export function useRejectHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      handoverId,
      body,
    }: HandoverActionArgs<RejectHandoverInput>) =>
      sendJson<{ handover: ProcessHandoverRow; view: ProcessInstanceView }>(
        `/api/process/handovers/${handoverId}/reject`,
        "POST",
        body,
        "Failed to return the handover",
      ),
    onSuccess: (_, { instanceId }) => invalidateInstance(qc, instanceId),
  });
}

export function useResendHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHandoverInput) =>
      sendJson<ProcessHandoverRow>(
        "/api/process/handovers",
        "POST",
        body,
        "Failed to send the handover",
      ),
    onSuccess: (_, { instance_id }) => invalidateInstance(qc, instance_id),
  });
}

export function useStartProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<StartProcessInput> &
        Pick<StartProcessInput, "process_key" | "entity_type" | "entity_id">,
    ) =>
      sendJson<ProcessInstanceView>(
        "/api/process/instances",
        "POST",
        body,
        "Failed to start the process",
      ),
    onSuccess: (view) => invalidateInstance(qc, view?.instance?.id ?? null),
  });
}

export function useSeedProcessDefinitions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      sendJson<Record<string, "exists" | "imported">>(
        "/api/process/definitions/seed",
        "POST",
        undefined,
        "Failed to seed the built-in processes",
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: processKeys.definitions }),
  });
}

export function useValidateDefinition() {
  return useMutation({
    mutationFn: (
      definition: ProcessDefinitionInput | Record<string, unknown>,
    ) =>
      sendJson<ImportDryRunResult>(
        "/api/process/definitions/import?dry_run=1",
        "POST",
        { definition, publish: false },
        "Validation failed",
      ),
  });
}

export function useImportDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      definition: ImportDefinitionInput["definition"] | Record<string, unknown>;
      publish: boolean;
    }) =>
      sendJson<{ version?: ProcessVersionRow } | Record<string, unknown>>(
        "/api/process/definitions/import",
        "POST",
        input,
        "Import failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: processKeys.definitions });
      qc.invalidateQueries({ queryKey: ["process", "definition"] });
    },
  });
}

export function useSetRoleDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetRoleDefaultInput) =>
      sendJson<ProcessRoleDefaultRow[]>(
        "/api/process/role-defaults",
        "PUT",
        body,
        "Failed to save the role default",
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: processKeys.roleDefaults }),
  });
}
