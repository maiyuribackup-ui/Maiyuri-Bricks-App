import type { DeliveryWithLines } from '@maiyuri/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DeliveryListFilters = {
  status?: string;
  search?: string;
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
