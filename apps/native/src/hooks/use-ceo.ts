import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shapes mirror apps/web/src/lib/ceo/* (keep in sync). */

export type CeoMoney = {
  bank: number;
  cash: number;
  accounts: { name: string; type: 'bank' | 'cash'; balance: number }[];
};

export type CeoProduct = {
  name: string;
  cost: number;
  price: number;
  margin: number;
  margin_pct: number;
  stock_qty: number;
  cost_breakdown: { material: string; amount: number }[];
};

export type CeoProfitPeriod = {
  label: string;
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  net: number;
  invoice_count: number;
};

export type CeoPipeline = {
  stages: { stage: string; count: number; value: number }[];
  open_count: number;
  open_value: number;
};

export type CeoAction = {
  headline: string;
  why: string;
  expected_impact: string;
  urgency: 'today' | 'this_week';
  watchlist: string[];
  ai_used: boolean;
};

export type CeoBriefing = {
  money: CeoMoney | null;
  products: CeoProduct[];
  profit: CeoProfitPeriod[];
  pipeline: CeoPipeline | null;
  receivables: {
    outstanding: number;
    overdue: number;
    overdue_count: number;
  } | null;
  action: CeoAction;
  generated_at: string;
};

export const CEO_ROLES = ['founder', 'owner'];

// ---- P&L (shapes mirror apps/web/src/lib/ceo/pnl.ts) ----

export type PnlAccount = {
  account_id: number;
  account: string;
  amount: number;
  entry_count: number;
};

export type PnlStatement = {
  month: string;
  from: string;
  to: string;
  revenue: { total: number; accounts: PnlAccount[] };
  expenses: { total: number; accounts: PnlAccount[] };
  net: number;
};

export type PnlLine = {
  date: string;
  move: string;
  partner: string | null;
  label: string | null;
  amount: number;
};

export function usePnl(month: string) {
  return useQuery({
    queryKey: ['ceo-pnl', month],
    queryFn: () =>
      api.get<PnlStatement>('/api/ceo/pnl', { month }, { timeoutMs: 55_000 }),
    staleTime: 10 * 60 * 1000,
  });
}

/** Journal entries behind one account row — fetched lazily on expand. */
export function usePnlLines(
  accountId: number | null,
  month: string,
  kind: 'income' | 'expense',
) {
  return useQuery({
    queryKey: ['ceo-pnl-lines', accountId, month],
    queryFn: () =>
      api.get<PnlLine[]>(
        '/api/ceo/pnl/lines',
        { account_id: accountId, month, kind },
        { timeoutMs: 55_000 },
      ),
    enabled: accountId != null,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCeoBriefing(enabled: boolean) {
  return useQuery({
    queryKey: ['ceo-briefing'],
    // Odoo fan-out + one LLM call — needs more than the default 20s.
    queryFn: () =>
      api.get<CeoBriefing>('/api/ceo/briefing', undefined, { timeoutMs: 55_000 }),
    enabled,
    staleTime: 10 * 60 * 1000, // expensive; refresh is pull-to-refresh
  });
}
