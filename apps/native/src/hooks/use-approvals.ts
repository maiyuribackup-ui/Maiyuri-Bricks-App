import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ticket, WorkItem } from '@maiyuri/shared';
import { api } from '@/lib/api';
import { useMyProfile } from '@/hooks/use-push-settings';
import { useAuth } from '@/store/auth';

/**
 * Mobile approvals workspace hooks. Two queues share one screen:
 *  - Tickets (production orders / quote & payment approvals) —
 *    roles: engineer, accountant, owner, founder (canApproveTickets on server)
 *  - My Work submissions — roles: founder, owner, production_supervisor
 * Server enforces both; the role helpers below only decide what to RENDER.
 */

export const TICKET_APPROVER_ROLES = ['engineer', 'accountant', 'owner', 'founder'];
export const WORK_ADMIN_ROLES = ['founder', 'owner', 'production_supervisor'];

export function useMyRole(): string {
  const userId = useAuth((s) => s.session?.user?.id);
  const profile = useMyProfile(userId);
  return (profile.data?.data.role as string | undefined) ?? '';
}

/** Pending tickets awaiting a decision. */
export function usePendingTickets(enabled: boolean) {
  return useQuery({
    queryKey: ['tickets', 'pending'],
    queryFn: () => api.get<Ticket[]>('/api/tickets', { status: 'pending' }),
    enabled,
  });
}

/** Submitted work items awaiting supervisor review. */
export function useWorkReviewQueue(enabled: boolean) {
  return useQuery({
    queryKey: ['my-work', 'review'],
    queryFn: () => api.get<WorkItem[]>('/api/my-work', { view: 'review' }),
    enabled,
  });
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['tickets'] });
  void queryClient.invalidateQueries({ queryKey: ['my-work'] });
}

export function useApproveTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts: { id: string; notes?: string }) =>
      api.put(`/api/tickets/${opts.id}/approve`, { notes: opts.notes }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useRejectTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts: { id: string; reason: string }) =>
      api.put(`/api/tickets/${opts.id}/reject`, { reason: opts.reason }),
    onSuccess: () => invalidateAll(queryClient),
  });
}
