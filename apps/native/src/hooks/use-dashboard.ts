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

/** Subset of GET /api/dashboard/analytics we render on mobile. */
export type DashboardRevenue = {
  revenueWon: number;
  pipelineValue: number;
  avgOrderValue: number;
  leadToOrderRate: number;
  quoteToOrderRate: number;
};

type DashboardAnalytics = {
  revenue?: DashboardRevenue;
};

export function useDashboardRevenue() {
  return useQuery({
    queryKey: ['dashboard-analytics', 'month'],
    queryFn: () =>
      api.get<DashboardAnalytics>('/api/dashboard/analytics', { period: 'month' }),
    staleTime: 5 * 60_000, // heavier query — refresh at most every 5 min
  });
}

/** ₹ compact: 1.2Cr / 45L / 80K — the format the business reads daily. */
export function formatINR(value: number): string {
  if (!value || Number.isNaN(value)) return '₹0';
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(0)}K`;
  return `₹${Math.round(value)}`;
}
