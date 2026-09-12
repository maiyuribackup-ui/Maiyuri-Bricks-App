import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptHandoverInput,
  AddProcessEvidenceInput,
  AdvanceProcessInput,
  BlockProcessInput,
  CompleteProcessTaskInput,
  ProcessDefinitionView,
  ProcessEventRow,
  ProcessHandoverRow,
  ProcessInstanceView,
  ProcessVersionRow,
  ProcessWorkQueue,
  RejectHandoverInput,
  StartProcessInput,
} from "@maiyuri/shared";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

/**
 * Process OS — thin TanStack Query layer over /api/process/* (apps/web).
 * Every mutation invalidates the process caches AND My Work, because each
 * open stage is mirrored as a work_items row (source_module 'process_os').
 * Errors are surfaced through the app toast (which also fires the haptic).
 */

export type ProcessDefinitionDetail = ProcessDefinitionView & {
  versions: ProcessVersionRow[];
};

export type ProcessHistoryEvent = ProcessEventRow & {
  actor_name: string | null;
};

export const PROCESS_KEYS = {
  all: ["process"] as const,
  definitions: ["process", "definitions"] as const,
  definition: (key: string) => ["process", "definitions", key] as const,
  instance: (id: string) => ["process", "instance", id] as const,
  forLead: (leadId: string) => ["process", "for-lead", leadId] as const,
  work: ["process", "work"] as const,
  history: (id: string) => ["process", "history", id] as const,
};

/**
 * The API reports a failed gate as "message [GATE_KEY]" (422). Turn the
 * trailing key into a readable label so staff see "Checklist incomplete
 * (gate: Checklist)" instead of an upper-snake token.
 */
export function formatProcessError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (!raw) return fallback;
  const match = /^(.*?)\s*\[([A-Z][A-Z0-9_]*)\]\s*$/.exec(raw);
  if (!match) return raw;
  const gateLabel = (match[2] ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
  return `${match[1]} (gate: ${gateLabel})`;
}

// ---------- queries ----------

export function useProcessDefinitions() {
  return useQuery({
    queryKey: PROCESS_KEYS.definitions,
    queryFn: () => api.get<ProcessDefinitionView[]>("/api/process/definitions"),
  });
}

export function useProcessDefinition(key: string | undefined) {
  return useQuery({
    queryKey: PROCESS_KEYS.definition(key ?? ""),
    queryFn: () =>
      api.get<ProcessDefinitionDetail>(`/api/process/definitions/${key}`),
    enabled: !!key,
  });
}

export function useProcessInstance(id: string | undefined) {
  return useQuery({
    queryKey: PROCESS_KEYS.instance(id ?? ""),
    queryFn: () => api.get<ProcessInstanceView>(`/api/process/instances/${id}`),
    enabled: !!id,
  });
}

/** Active process case for a lead (null when none has been started). */
export function useProcessForLead(leadId: string | undefined) {
  return useQuery({
    queryKey: PROCESS_KEYS.forLead(leadId ?? ""),
    queryFn: () =>
      api.get<ProcessInstanceView | null>(
        `/api/process/instances/for/lead/${leadId}`,
      ),
    enabled: !!leadId,
  });
}

export function useProcessWork() {
  return useQuery({
    queryKey: PROCESS_KEYS.work,
    queryFn: () => api.get<ProcessWorkQueue>("/api/process/work"),
  });
}

export function useProcessHistory(id: string | undefined) {
  return useQuery({
    queryKey: PROCESS_KEYS.history(id ?? ""),
    queryFn: () =>
      api.get<ProcessHistoryEvent[]>(`/api/process/instances/${id}/history`),
    enabled: !!id,
  });
}

// ---------- mutations ----------

function useInvalidateProcess() {
  const queryClient = useQueryClient();
  return (instanceId?: string) => {
    void queryClient.invalidateQueries({ queryKey: PROCESS_KEYS.all });
    void queryClient.invalidateQueries({ queryKey: ["my-work"] });
    if (instanceId) {
      void queryClient.invalidateQueries({
        queryKey: PROCESS_KEYS.instance(instanceId),
      });
    }
  };
}

type TaskCompleteVars = {
  taskId: string;
  instanceId?: string;
  /** Untick a done/na task (adds ?reopen=1). */
  reopen?: boolean;
} & CompleteProcessTaskInput;

/** Tick / untick one checklist task of the current stage. */
export function useCompleteProcessTask() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({
      taskId,
      instanceId: _i,
      reopen,
      ...body
    }: TaskCompleteVars) => {
      // Query string kept out of the template so the mobile-API checker can
      // match the route file (`scripts/check-mobile-api.mjs`).
      const query = reopen ? "?reopen=1" : "";
      return api.post<unknown>(
        `/api/process/tasks/${taskId}/complete` + query,
        reopen ? undefined : body,
      );
    },
    onSuccess: (_d, vars) => invalidate(vars.instanceId),
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not update the task")),
  });
}

type AdvanceVars = { instanceId: string } & AdvanceProcessInput;

/** Complete the current stage (optionally with a decision outcome / handover). */
export function useAdvanceProcess() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({ instanceId, ...body }: AdvanceVars) =>
      api.post<ProcessInstanceView>(
        `/api/process/instances/${instanceId}/advance`,
        body,
      ),
    onSuccess: (_d, vars) => {
      invalidate(vars.instanceId);
      toast.success("Stage completed");
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not complete the stage")),
  });
}

type BlockVars = { instanceId: string } & BlockProcessInput;

export function useBlockProcess() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({ instanceId, ...body }: BlockVars) =>
      api.post<ProcessInstanceView>(
        `/api/process/instances/${instanceId}/block`,
        body,
      ),
    onSuccess: (_d, vars) => {
      invalidate(vars.instanceId);
      toast.success("Exception raised");
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not raise the exception")),
  });
}

type UnblockVars = {
  instanceId: string;
  expected_stage_instance_id: string;
  note?: string;
};

export function useUnblockProcess() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({ instanceId, ...body }: UnblockVars) =>
      api.post<ProcessInstanceView>(
        `/api/process/instances/${instanceId}/unblock`,
        body,
      ),
    onSuccess: (_d, vars) => {
      invalidate(vars.instanceId);
      toast.success("Exception cleared");
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not clear the exception")),
  });
}

type AcceptHandoverVars = {
  handoverId: string;
  instanceId?: string;
} & Partial<AcceptHandoverInput>;

export function useAcceptHandover() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({ handoverId, instanceId: _i, ...body }: AcceptHandoverVars) =>
      api.post<{
        handover: ProcessHandoverRow;
        view: ProcessInstanceView;
        advanced: boolean;
      }>(`/api/process/handovers/${handoverId}/accept`, body),
    onSuccess: (res, vars) => {
      invalidate(vars.instanceId);
      toast.success(
        res.data.advanced
          ? "Handover accepted — stage completed"
          : "Handover accepted",
      );
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not accept the handover")),
  });
}

type RejectHandoverVars = {
  handoverId: string;
  instanceId?: string;
} & RejectHandoverInput;

export function useRejectHandover() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({ handoverId, instanceId: _i, ...body }: RejectHandoverVars) =>
      api.post<{ handover: ProcessHandoverRow; view: ProcessInstanceView }>(
        `/api/process/handovers/${handoverId}/reject`,
        body,
      ),
    onSuccess: (_d, vars) => {
      invalidate(vars.instanceId);
      toast.success("Returned to sales with the exception");
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not return the handover")),
  });
}

type EvidenceVars = { instanceId: string } & AddProcessEvidenceInput;

export function useAddProcessEvidence() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: ({ instanceId, ...body }: EvidenceVars) =>
      api.post<unknown>(`/api/process/instances/${instanceId}/evidence`, body),
    onSuccess: (_d, vars) => {
      invalidate(vars.instanceId);
      toast.success("Evidence added");
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not add evidence")),
  });
}

type StartVars = Pick<
  StartProcessInput,
  "process_key" | "entity_type" | "entity_id"
> &
  Partial<Pick<StartProcessInput, "context" | "start_stage_key">>;

/** Start a new case (e.g. Lead-to-Delivery for a lead). */
export function useStartProcess() {
  const invalidate = useInvalidateProcess();
  return useMutation({
    mutationFn: (body: StartVars) =>
      api.post<ProcessInstanceView>("/api/process/instances", body),
    onSuccess: (res) => {
      invalidate(res.data.instance.id);
      toast.success("Process started");
    },
    onError: (e) =>
      toast.error(formatProcessError(e, "Could not start the process")),
  });
}
