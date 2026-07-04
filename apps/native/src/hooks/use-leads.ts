import type { Lead } from '@maiyuri/shared';
import { useQuery } from '@tanstack/react-query';
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
