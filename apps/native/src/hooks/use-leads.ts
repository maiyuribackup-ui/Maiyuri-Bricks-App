import type { Lead } from '@maiyuri/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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

const PAGE_SIZE = 50;

/**
 * Server-paginated lead list for the Leads screen — pages accumulate as the
 * user scrolls, so large books of business aren't silently truncated.
 * Key starts with 'leads' so the existing mutations' invalidations hit it.
 */
export function useInfiniteLeads(filters: Omit<LeadFilters, 'page' | 'limit'> = {}) {
  return useInfiniteQuery({
    queryKey: ['leads', 'infinite', filters],
    queryFn: ({ pageParam }) =>
      api.get<Lead[]>('/api/leads', { ...filters, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const total = lastPage.meta?.total ?? 0;
      const loaded = pages.reduce((n, p) => n + (p.data?.length ?? 0), 0);
      return loaded < total && (lastPage.data?.length ?? 0) > 0
        ? pages.length + 1
        : undefined;
    },
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
