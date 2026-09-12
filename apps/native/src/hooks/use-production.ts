import type { ProductionOrder } from '@maiyuri/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ProductionOrderListFilters = {
  status?: string;
  search?: string;
};

/** GET /api/production/orders — returns ProductionOrder[] (shared type). */
export function useProductionOrders(filters: ProductionOrderListFilters = {}) {
  return useQuery({
    queryKey: ['production-orders', filters],
    queryFn: () =>
      api.get<ProductionOrder[]>('/api/production/orders', { ...filters }),
  });
}

/** PUT /api/production/orders/:id — status, actual_quantity, notes, dates. */
export function useUpdateProductionOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.put<ProductionOrder>(`/api/production/orders/${id}`, body),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
  });
}

/** POST /api/production/orders/:id/submit-for-approval — creates a ticket. */
export function useSubmitForApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.post(`/api/production/orders/${id}/submit-for-approval`, {
        priority: 'medium',
        notes: notes ?? null,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
  });
}
