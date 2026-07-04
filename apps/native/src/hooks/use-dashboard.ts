import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shape of GET /api/dashboard/stats (see apps/web/app/api/dashboard/stats). */
export type DashboardStats = {
  totalLeads: number;
  hotLeads: number;
  dueToday: number;
  converted: number;
  newLeads: number;
  followUp: number;
  cold: number;
  lost: number;
};

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/api/dashboard/stats'),
  });
}
