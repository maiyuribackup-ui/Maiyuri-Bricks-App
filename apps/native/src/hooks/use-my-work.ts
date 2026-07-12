import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChecklistResponseStatus,
  MyWorkQueue,
  WorkItem,
} from '@maiyuri/shared';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://mb.maiyuri.com';

/** The signed-in employee's grouped work queue. */
export function useMyWork() {
  return useQuery({
    queryKey: ['my-work'],
    queryFn: () => api.get<MyWorkQueue>('/api/my-work'),
  });
}

/** Full detail for one work item (checklist, attachments, history). */
export function useWorkItem(id: string | undefined) {
  return useQuery({
    queryKey: ['my-work', id],
    queryFn: () => api.get<WorkItem>(`/api/my-work/${id}`),
    enabled: !!id,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: ['my-work'] });
  void queryClient.invalidateQueries({ queryKey: ['my-work', id] });
}

/** Move pending/returned → in_progress (idempotent). */
export function useStartWork(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WorkItem>(`/api/my-work/${id}/start`),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/** Complete a SIMPLE task (server validates note/photo requirements → 422). */
export function useCompleteWork(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string | null }) =>
      api.post<WorkItem>(`/api/my-work/${id}/complete`, body),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export type DraftResponse = {
  template_item_id: string;
  status?: ChecklistResponseStatus | null;
  text_value?: string | null;
  number_value?: number | null;
  note?: string | null;
};

/** Persist checklist answers + note (also mints response ids for photos). */
export function useSaveDraft(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string | null; responses?: DraftResponse[] }) =>
      api.put<{ saved_at: string }>(`/api/my-work/${id}/draft`, body),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/** Submit a checklist task (server validates all mandatory answers → 422). */
export function useSubmitChecklist(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WorkItem>(`/api/my-work/${id}/submit`),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/**
 * Upload a photo as evidence. Multipart, so it bypasses the JSON api client —
 * attaches the Supabase bearer directly. Pass checklistResponseId to bind the
 * photo to a specific checklist answer (that answer must be saved first).
 */
export function useUploadWorkPhoto(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts: {
      uri: string;
      checklistResponseId?: string;
    }): Promise<{ id: string }> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const form = new FormData();
      // React Native FormData file shape.
      form.append('file', {
        uri: opts.uri,
        name: `photo-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
      if (opts.checklistResponseId) {
        form.append('checklist_response_id', opts.checklistResponseId);
      }
      const res = await fetch(`${BASE_URL}/api/my-work/${id}/attachments`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Upload failed (${res.status})`);
      }
      return json.data;
    },
    onSuccess: () => invalidate(queryClient, id),
  });
}
