import type { Note } from '@maiyuri/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** GET /api/leads/:id/notes — paginated, newest first (server default). */
export function useLeadNotes(leadId: string) {
  return useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: () => api.get<Note[]>(`/api/leads/${leadId}/notes`, { limit: 50 }),
    enabled: !!leadId,
  });
}

/** POST /api/leads/:id/notes — body { lead_id, text } per createNoteSchema. */
export function useAddNote(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api.post<Note>(`/api/leads/${leadId}/notes`, { lead_id: leadId, text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
    },
  });
}
