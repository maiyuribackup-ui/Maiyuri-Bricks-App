import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shape of GET /api/dashboard/ops (see apps/web/app/api/dashboard/ops). */
export type OpsSnapshot = {
  stock: { name: string; qty: number }[];
  stock_synced_at: string | null;
  cement: { kg: number; bags: number } | null;
  balances: {
    bank: number;
    cash: number;
    accounts: { name: string; type: 'bank' | 'cash'; balance: number }[];
  } | null;
  as_of: string;
};

/** Roles whose home screen leads with the Ops snapshot. Keep in sync with
 *  OPS_HOME_ROLES on the server route (which is the real gate). */
export const OPS_HOME_ROLES = [
  'production_supervisor',
  'accountant',
  'founder',
  'owner',
];

export function useOpsSnapshot(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', 'ops'],
    queryFn: () => api.get<OpsSnapshot>('/api/dashboard/ops'),
    enabled,
    staleTime: 5 * 60 * 1000, // balances/stock don't move minute-to-minute
  });
}
