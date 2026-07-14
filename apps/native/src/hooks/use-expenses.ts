import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllExpensesResponse,
  CreateExpenseInput,
  ExpenseClaim,
  MyExpensesResponse,
} from '@maiyuri/shared';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://mb.maiyuri.com';

/** Roles that hold a petty-cash balance and record expenses. */
export const EXPENSE_SUBMITTER_ROLES = [
  'engineer',
  'driver',
  'sales',
  'production_supervisor',
];
export const EXPENSE_ADMIN_ROLES = ['founder', 'owner', 'accountant'];

/** The signed-in staffer's balance + own claims/topups + masters. */
export function useMyExpenses() {
  return useQuery({
    queryKey: ['expenses', 'mine'],
    queryFn: () => api.get<MyExpensesResponse>('/api/expenses'),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateExpenseInput>) =>
      api.post<ExpenseClaim>('/api/expenses', body),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

/** Upload a receipt image (multipart). Returns the storage path to store. */
export function useUploadReceipt() {
  return useMutation({
    mutationFn: async (uri: string): Promise<{ path: string; url: string | null }> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const form = new FormData();
      form.append('file', {
        uri,
        name: `receipt-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
      const res = await fetch(`${BASE_URL}/api/expenses/receipts`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`);
      return json.data;
    },
  });
}

// ---- admin (approvals screen) ----

export function useExpenseQueue(enabled: boolean) {
  return useQuery({
    queryKey: ['expenses', 'queue'],
    queryFn: () => api.get<AllExpensesResponse>('/api/expenses', { view: 'all' }),
    enabled,
  });
}

export function useApproveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/expenses/${id}/approve`, {}),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useRejectExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/api/expenses/${v.id}/reject`, { reason: v.reason }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
