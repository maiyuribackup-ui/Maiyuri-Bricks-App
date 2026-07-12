import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateChecklistTemplateInput,
  CreateWorkItemInput,
  MyWorkQueue,
  SaveWorkDraftInput,
  WorkChecklistTemplate,
  WorkItem,
  WorkItemAttachment,
} from "@maiyuri/shared";

interface ApiResponse<T> {
  data: T;
  error?: string;
  meta?: { total?: number };
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error || fallback);
}

// ============================================
// Queue + detail
// ============================================

async function fetchQueue(): Promise<ApiResponse<MyWorkQueue>> {
  const res = await fetch("/api/my-work");
  if (!res.ok) await throwApiError(res, "Failed to load your work");
  return res.json();
}

async function fetchWorkItem(id: string): Promise<ApiResponse<WorkItem>> {
  const res = await fetch(`/api/my-work/${id}`);
  if (!res.ok) await throwApiError(res, "Failed to load the work item");
  return res.json();
}

export function useMyWorkQueue() {
  return useQuery({
    queryKey: ["my-work"],
    queryFn: fetchQueue,
    refetchInterval: 60_000, // keep the badge/summary fresh
  });
}

export function useWorkItem(id: string | null) {
  return useQuery({
    queryKey: ["my-work-item", id],
    queryFn: () => fetchWorkItem(id!),
    enabled: !!id,
  });
}

// ============================================
// Lifecycle actions
// ============================================

function invalidateWork(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ["my-work"] });
  if (id) queryClient.invalidateQueries({ queryKey: ["my-work-item", id] });
}

async function postAction(id: string, action: string, body?: unknown) {
  const res = await fetch(`/api/my-work/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) await throwApiError(res, `Failed to ${action} the work item`);
  return res.json() as Promise<ApiResponse<WorkItem>>;
}

export function useStartWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postAction(id, "start"),
    onSuccess: (_, id) => invalidateWork(queryClient, id),
  });
}

export function useCompleteWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      postAction(id, "complete", { note }),
    onSuccess: (_, { id }) => invalidateWork(queryClient, id),
  });
}

export function useSubmitWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postAction(id, "submit"),
    onSuccess: (_, id) => invalidateWork(queryClient, id),
  });
}

export function useSaveDraft() {
  return useMutation({
    mutationFn: async ({
      id,
      draft,
    }: {
      id: string;
      draft: SaveWorkDraftInput;
    }) => {
      const res = await fetch(`/api/my-work/${id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) await throwApiError(res, "Failed to save your draft");
      return res.json() as Promise<ApiResponse<{ saved_at: string }>>;
    },
    // No detail invalidation on purpose: autosave must not clobber the
    // user's in-progress local edits with a refetch.
    onSuccess: () => {},
  });
}

// ============================================
// Attachments
// ============================================

export function useUploadWorkPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      file,
      caption,
      checklistResponseId,
    }: {
      id: string;
      file: File;
      caption?: string;
      checklistResponseId?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (caption) formData.append("caption", caption);
      if (checklistResponseId)
        formData.append("checklist_response_id", checklistResponseId);

      const res = await fetch(`/api/my-work/${id}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) await throwApiError(res, "Photo upload failed");
      return res.json() as Promise<ApiResponse<WorkItemAttachment>>;
    },
    onSuccess: (_, { id }) =>
      queryClient.invalidateQueries({ queryKey: ["my-work-item", id] }),
  });
}

export function useRemoveWorkPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      attachmentId,
    }: {
      id: string;
      attachmentId: string;
    }) => {
      const res = await fetch(
        `/api/my-work/${id}/attachments?attachment_id=${attachmentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) await throwApiError(res, "Failed to remove the photo");
      return res.json();
    },
    onSuccess: (_, { id }) =>
      queryClient.invalidateQueries({ queryKey: ["my-work-item", id] }),
  });
}

// ============================================
// Admin
// ============================================

export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkItemInput) => {
      const res = await fetch("/api/my-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwApiError(res, "Failed to create the work item");
      return res.json() as Promise<ApiResponse<WorkItem>>;
    },
    onSuccess: () => invalidateWork(queryClient),
  });
}

export function useChecklistTemplates(enabled = true) {
  return useQuery({
    queryKey: ["work-checklist-templates"],
    queryFn: async () => {
      const res = await fetch("/api/my-work/checklist-templates");
      if (!res.ok) await throwApiError(res, "Failed to load templates");
      return res.json() as Promise<ApiResponse<WorkChecklistTemplate[]>>;
    },
    enabled,
  });
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateChecklistTemplateInput) => {
      const res = await fetch("/api/my-work/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwApiError(res, "Failed to create the template");
      return res.json() as Promise<ApiResponse<WorkChecklistTemplate>>;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["work-checklist-templates"] }),
  });
}
