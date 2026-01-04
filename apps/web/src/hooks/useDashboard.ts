import { useQuery } from '@tanstack/react-query';
import type { LeadStats } from '@maiyuri/shared';

interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  hotLeads: number;
  convertedLeads: number;
  conversionRate: number;
  followUpsToday: number;
  avgResponseTime: string;
}

interface RecentActivity {
  id: string;
  type: 'lead_created' | 'note_added' | 'status_changed' | 'lead_converted';
  description: string;
  timestamp: string;
  leadId?: string;
  leadName?: string;
}

async function fetchDashboardStats(): Promise<{ data: DashboardStats }> {
  const res = await fetch('/api/dashboard/stats');
  if (!res.ok) {
    // Return mock data for now
    return {
      data: {
        totalLeads: 0,
        newLeads: 0,
        hotLeads: 0,
        convertedLeads: 0,
        conversionRate: 0,
        followUpsToday: 0,
        avgResponseTime: '-',
      },
    };
  }
  return res.json();
}

async function fetchLeadStats(): Promise<{ data: LeadStats[] }> {
  const res = await fetch('/api/dashboard/lead-stats');
  if (!res.ok) {
    return { data: [] };
  }
  return res.json();
}

async function fetchRecentActivity(): Promise<{ data: RecentActivity[] }> {
  const res = await fetch('/api/dashboard/activity');
  if (!res.ok) {
    return { data: [] };
  }
  return res.json();
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchDashboardStats,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['leadStats'],
    queryFn: fetchLeadStats,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ['recentActivity'],
    queryFn: fetchRecentActivity,
    staleTime: 30 * 1000,
  });
}
