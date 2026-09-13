import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

// ---- shapes mirrored from /api/factory (keep in sync with apps/web) ----

export type FactoryStockRow = {
  id: string;
  code: string;
  opening_stock: number | null;
  opening_counted_at: string | null;
  produced: number;
  delivered: number;
  committed: number;
  stock_balance: number;
  free_stock: number;
  bricks_per_bag: number | null;
};

export type FactoryProduct = { id: string; code: string };

export type FactoryDelivery = {
  id: string;
  delivery_date: string;
  qty: number;
  status: 'Planned' | 'Delivered' | 'Postponed' | 'Cancelled';
  data_flag: string;
  notes: string | null;
  factory_customers: { name: string; credit_hold: boolean } | null;
  factory_products: { code: string } | null;
};

export type FactoryLogRow = {
  id: string;
  log_date: string;
  qty_produced: number;
  cement_bags: number | null;
  downtime_reason: string;
  remarks: string | null;
  data_flag: string;
  factory_products: { code: string } | null;
};

// ---- hooks ----

export function useFactoryStock() {
  return useQuery({
    queryKey: ['factory', 'stock'],
    queryFn: () => api.get<FactoryStockRow[]>('/api/factory/stock'),
  });
}

export function useFactoryProducts() {
  return useQuery({
    queryKey: ['factory', 'products'],
    queryFn: () => api.get<FactoryProduct[]>('/api/factory/products'),
  });
}

/** Sat–Fri schedule; pass any date inside the wanted week. */
export function useFactorySchedule(week: string) {
  return useQuery({
    queryKey: ['factory', 'schedule', week],
    queryFn: () =>
      api.get<FactoryDelivery[]>('/api/factory/deliveries', { week }),
  });
}

export function useFactoryLog() {
  return useQuery({
    queryKey: ['factory', 'log'],
    queryFn: () => api.get<FactoryLogRow[]>('/api/factory/production-log'),
  });
}

/** Upsert a production day (date+product). Re-submitting edits, not duplicates. */
export function useSaveProductionLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      log_date: string;
      product_id: string;
      qty_produced: number;
      cement_bags: number | null;
      downtime_reason: string;
      remarks: string | null;
    }) => api.post('/api/factory/production-log', body),
    onSuccess: () => {
      toast.success('Production day saved');
      void queryClient.invalidateQueries({ queryKey: ['factory'] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Failed to save production'),
  });
}

/** Planned → Delivered / Postponed with optimistic update. */
export function useUpdateDeliveryStatus(week: string) {
  const queryClient = useQueryClient();
  const key = ['factory', 'schedule', week];
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FactoryDelivery['status'] }) =>
      api.patch(`/api/factory/deliveries/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<{ data: FactoryDelivery[] }>(key);
      if (prev?.data) {
        queryClient.setQueryData(key, {
          ...prev,
          data: prev.data.map((d) => (d.id === id ? { ...d, status } : d)),
        });
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      toast.error(e instanceof Error ? e.message : 'Update failed');
    },
    onSuccess: (_res, vars) => {
      toast.success(vars.status === 'Delivered' ? '✓ Marked delivered' : 'Updated');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['factory'] });
    },
  });
}

export function useSaveLabour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      work_date: string;
      worker: string;
      work_type: string;
      qty: number;
      rate: number;
      notes: string | null;
    }) => api.post('/api/factory/labour', body),
    onSuccess: () => {
      toast.success('Labour entry saved');
      void queryClient.invalidateQueries({ queryKey: ['factory'] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Failed to save labour'),
  });
}
