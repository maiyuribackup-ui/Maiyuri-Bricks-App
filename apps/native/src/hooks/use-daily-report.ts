import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * GET /api/daily-report?date= — the Daily Operations Briefing as JSON.
 * Shapes mirror apps/web/src/lib/daily-report/aggregate.ts (keep in sync).
 */

export type SourceStatus = 'live' | 'pending' | 'error';
type Base = { status: SourceStatus; note?: string };

export type FinanceSection = Base & {
  invoiced: number;
  invoiceCount: number;
  expenses: number;
  expenseCount: number;
  net: number;
  topInvoices: { ref: string; party: string; amount: number }[];
  topExpenses: { label: string; amount: number }[];
};

export type ReceivablesSection = Base & {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  topDebtors: { customer: string; due: number; oldestDays: number }[];
};

export type PlanActualSection = Base & {
  plannedUnits: number;
  actualUnits: number;
  pct: number;
  byProduct: { name: string; planned: number; actual: number }[];
};

export type DeliverySection = Base & {
  planned: number;
  completed: number;
  rolledOver: number;
  tripKm: number;
  dieselCost: number;
};

export type LeadsSection = Base & {
  newLeads: number;
  hot: number;
  followupsDue: number;
};

export type CountSection = Base & {
  primary: number;
  metrics: { label: string; value: string }[];
};

export type DailyReport = {
  date: string;
  generatedAt: string;
  finance: FinanceSection;
  receivables: ReceivablesSection;
  production: PlanActualSection;
  deliveries: DeliverySection;
  leads: LeadsSection;
  calls: CountSection;
  whatsapp: CountSection;
  tasks: CountSection;
  recordings: CountSection;
};

/** Roles allowed to open the briefing (server re-checks). */
export const DAILY_REPORT_ROLES = ['founder', 'owner', 'accountant'];

/** Today in IST as YYYY-MM-DD — the factory's clock, matching the server. */
export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function useDailyReport(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['daily-report', date],
    // The aggregate fans out to Odoo + GA4 and can exceed the client's default
    // 20s timeout — allow the server's full 60s window (minus a safety margin).
    queryFn: () =>
      api.get<DailyReport>('/api/daily-report', { date }, { timeoutMs: 55_000 }),
    enabled,
    staleTime: 5 * 60 * 1000, // expensive — don't refetch on every focus
  });
}
