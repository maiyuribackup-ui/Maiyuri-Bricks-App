import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ---- shapes mirrored from apps/web/src/lib/ops-planning (keep in sync) ----

export type CachedOrderLine = {
  odoo_product_id: number | null;
  finished_good_id: string | null;
  product_name: string;
  qty_ordered: number;
  qty_delivered: number;
};

export type OpenOrder = {
  odoo_order_id: number;
  name: string;
  partner_name: string | null;
  state: string;
  date_order: string | null;
  commitment_date: string | null;
  amount_total: number | null;
  lines: CachedOrderLine[];
  remaining_units: number;
};

export type PlanningProduct = {
  finished_good_id: string;
  product_name: string;
  daily_capacity: number;
  curing_days: number;
  stock_qty: number;
  has_params: boolean;
};

export type PlanningInputs = {
  open_orders: OpenOrder[];
  products: PlanningProduct[];
  settings: {
    work_days: number[];
    max_deliveries_per_day: number;
    default_constraints_note: string | null;
  };
  active_plan: {
    id: string;
    name: string;
    horizon_start: string;
    horizon_end: string;
  } | null;
  stock_synced_at: string | null;
  orders_synced_at: string | null;
};

export type PlanItemDraft = {
  item_type: 'production' | 'delivery';
  item_date: string;
  finished_good_id: string | null;
  product_name: string;
  quantity: number;
  sale_order_ref: string;
  customer_name: string;
};

export type OrderPromise = {
  order_ref: string;
  customer_name: string;
  promised_delivery_date: string | null;
  late_vs_commitment: boolean;
  unfulfilled_units: number;
};

export type PlanWarning = {
  type: string;
  message: string;
  order_ref?: string;
};

export type DraftPlan = {
  name: string;
  horizon_start: string;
  horizon_end: string;
  constraint_text: string | null;
  selected_order_refs: string[];
  ai_rationale: string;
  ai_used: boolean;
  ai_priorities: unknown;
  items: PlanItemDraft[];
  promises: OrderPromise[];
  warnings: PlanWarning[];
  totals: { production_units: number; production_runs: number; deliveries: number };
};

export type PlanItem = PlanItemDraft & {
  id: string;
  status: 'planned' | 'done' | 'partial' | 'missed' | 'moved';
  actual_quantity: number | null;
};

// ---- hooks ----

/** GET (cached) planning inputs; call refresh() to pull fresh from Odoo. */
export function usePlanningInputs() {
  return useQuery({
    queryKey: ['ops-planning', 'inputs'],
    queryFn: () => api.get<PlanningInputs>('/api/ops-planning/inputs'),
    staleTime: 60_000,
  });
}

export function useRefreshInputs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PlanningInputs>('/api/ops-planning/inputs'),
    onSuccess: (res) => {
      queryClient.setQueryData(['ops-planning', 'inputs'], res);
    },
  });
}

export function useGeneratePlan() {
  return useMutation({
    mutationFn: (body: {
      horizon_days: number;
      constraint_text: string | null;
      selected_order_ids: number[];
    }) => api.post<DraftPlan>('/api/ops-planning/generate', body),
  });
}

export function useActivatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: DraftPlan) =>
      api.post<{ plan_id: string }>('/api/ops-planning/plans', draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ops-planning'] });
    },
  });
}

export function useActivePlan(from?: string, to?: string) {
  return useQuery({
    queryKey: ['ops-planning', 'active', from, to],
    queryFn: () =>
      api.get<{ plan: Record<string, unknown> | null; items: PlanItem[] }>(
        '/api/ops-planning/plans/active',
        { from, to },
      ),
  });
}

export function useUpdatePlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<PlanItem>(`/api/ops-planning/items/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ops-planning'] });
    },
  });
}

export function usePromiseDate() {
  return useMutation({
    mutationFn: (body: { finished_good_id: string; quantity: number }) =>
      api.post<{
        promised_delivery_date: string | null;
        unfulfilled_units: number;
      }>('/api/ops-planning/promise', body),
  });
}

export type VarianceData = {
  window: { from: string; to: string };
  production: {
    planned_units: number;
    actual_units: number;
    fulfillment_pct: number | null;
  };
  deliveries: { planned: number; completed: number };
  items: PlanItem[];
};

export function useVariance(days = 14) {
  return useQuery({
    queryKey: ['ops-planning', 'variance', days],
    queryFn: () => api.get<VarianceData>('/api/ops-planning/variance', { days }),
  });
}

export type ProductParams = {
  finished_good_id: string;
  product_name: string;
  stock_qty: number | null;
  daily_capacity_units: number | null;
  curing_days: number | null;
  min_batch: number | null;
};

export function useProductParams() {
  return useQuery({
    queryKey: ['ops-planning', 'params'],
    queryFn: () => api.get<ProductParams[]>('/api/ops-planning/params'),
  });
}

type SaveParamsBody = {
  finished_good_id: string;
  daily_capacity_units: number;
  curing_days: number;
  min_batch?: number;
};

type ParamsEnvelope = { data: ProductParams[]; meta?: unknown };

export function useSaveProductParams() {
  const queryClient = useQueryClient();
  const key = ['ops-planning', 'params'];
  return useMutation({
    mutationFn: (body: SaveParamsBody) => api.put('/api/ops-planning/params', body),
    // Optimistically patch the cached row so the settings list updates the
    // instant Save is tapped — don't wait on the refetch (that delay was
    // what made saves look like they "didn't stick").
    onMutate: async (body: SaveParamsBody) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ParamsEnvelope>(key);
      if (prev?.data) {
        queryClient.setQueryData<ParamsEnvelope>(key, {
          ...prev,
          data: prev.data.map((r) =>
            r.finished_good_id === body.finished_good_id
              ? {
                  ...r,
                  daily_capacity_units: body.daily_capacity_units,
                  curing_days: body.curing_days,
                  min_batch: body.min_batch ?? r.min_batch,
                }
              : r,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      // Roll back the optimistic patch if the server rejected the save.
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['ops-planning'] });
    },
  });
}
