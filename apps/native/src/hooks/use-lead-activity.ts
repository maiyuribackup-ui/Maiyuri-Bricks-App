import type { CallRecording } from '@maiyuri/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type OdooSyncLog = {
  id: string;
  lead_id: string;
  sync_type: 'lead_push' | 'lead_pull' | 'quote_pull';
  status: 'success' | 'error';
  odoo_response?: {
    quotes?: Array<{
      number?: string;
      name?: string;
      amount?: number;
      state?: string;
      date?: string;
    }>;
    latestQuote?: string;
    latestOrder?: string;
  } | null;
  error_message?: string | null;
  created_at: string;
};

export function useLeadCallRecordings(leadId: string) {
  return useQuery({
    queryKey: ['lead-call-recordings', leadId],
    queryFn: () =>
      api.get<CallRecording[]>(`/api/leads/${leadId}/call-recordings`, {
        status: 'all',
        limit: 100,
      }),
    enabled: !!leadId,
  });
}

export function useLeadOdooSyncLogs(leadId: string) {
  return useQuery({
    queryKey: ['lead-odoo-sync-logs', leadId],
    queryFn: async () => {
      const result = await api.get<{ recentLogs?: OdooSyncLog[] }>(`/api/odoo/sync/${leadId}`);
      return result.data.recentLogs ?? [];
    },
    enabled: !!leadId,
  });
}
