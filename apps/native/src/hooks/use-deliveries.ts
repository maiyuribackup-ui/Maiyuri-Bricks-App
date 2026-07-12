import type { DeliveryWithLines } from '@maiyuri/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DeliveryListFilters = {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

/** GET /api/deliveries — returns DeliveryWithLines[] (shared type). */
export function useDeliveries(filters: DeliveryListFilters = {}) {
  return useQuery({
    queryKey: ['deliveries', filters],
    queryFn: () =>
      api.get<DeliveryWithLines[]>('/api/deliveries', {
        limit: 50,
        sortOrder: 'desc',
        ...filters,
      }),
  });
}

export type CompleteDeliveryInput = {
  id: string;
  /** base64 data URLs — the API stores them (same contract as the web app). */
  photoUrls?: string[];
  recipientName?: string;
  notes?: string;
};

/**
 * POST /api/deliveries/:id/complete — proof-of-delivery.
 * mutationKey matches the default in query-client.ts so an offline
 * "Mark Delivered" queues (pauses), survives app restarts via the
 * persister, and replays automatically when the network returns.
 */
export function useCompleteDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['complete-delivery'],
    mutationFn: ({ id, ...body }: CompleteDeliveryInput) =>
      api.post(`/api/deliveries/${id}/complete`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}
