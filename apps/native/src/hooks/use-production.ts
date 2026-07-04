import type { ProductionOrder } from '@maiyuri/shared';
import { useQuery } from '@tanstack/react-query';
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
