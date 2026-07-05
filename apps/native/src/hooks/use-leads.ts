import type { Lead } from '@maiyuri/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type LeadFilters = {
  search?: string;
  lead_status?: string;
  pipeline_stage?: string;
  lead_temperature?: string;
  page?: number;
  limit?: number;
};

/**
 * List leads. Reuses the `Lead` type from @maiyuri/shared so the mobile app
 * and web app share one source of truth for the data model.
 */
export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => api.get<Lead[]>('/api/leads', { limit: 50, ...filters }),
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<Lead>(`/api/leads/${id}`),
    enabled: !!id,
  });
}

/** POST /api/leads — body validated against createLeadSchema by the server. */
export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Lead>('/api/leads', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

/**
 * PATCH /api/leads/:id — same endpoint the web Quick Actions panel uses.
 * Accepts any updateLeadSchema fields (lead_status, pipeline_stage,
 * lead_temperature, follow_up_date, next_action, …).
 */
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Lead>(`/api/leads/${id}`, body),
    onSuccess: (_res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['lead', vars.id] });
    },
  });
}
