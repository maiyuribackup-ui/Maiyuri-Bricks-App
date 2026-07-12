import type { Ticket, WorkItem } from '@maiyuri/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  TICKET_APPROVER_ROLES,
  WORK_ADMIN_ROLES,
  useApproveTicket,
  useMyRole,
  usePendingTickets,
  useRejectTicket,
  useWorkReviewQueue,
} from '@/hooks/use-approvals';
import { toast } from '@/lib/toast';

const TYPE_LABEL: Record<string, string> = {
  production_order: '🏭 Production order',
  quote_approval: '🧾 Quote approval',
  payment_approval: '💰 Payment approval',
};

function TicketCard({ ticket }: { ticket: Ticket }) {
  const approve = useApproveTicket();
  const reject = useRejectTicket();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const busy = approve.isPending || reject.isPending;

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-xs font-semibold text-slate-400">
        {TYPE_LABEL[ticket.type] ?? ticket.type} · #{ticket.ticket_number}
      </Text>
      <Text className="mt-1 text-base font-semibold text-ink">{ticket.title}</Text>
      {ticket.description ? (
        <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={3}>
          {ticket.description}
        </Text>
      ) : null}
      <Text className="mt-1 text-xs text-slate-400">
        Raised by {ticket.created_by_user?.full_name ?? 'unknown'} ·{' '}
        {new Date(ticket.created_at).toLocaleDateString()}
        {ticket.priority ? ` · ${ticket.priority}` : ''}
      </Text>

      {rejecting ? (
        <View className="mt-2">
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Why is this rejected? (required)"
            placeholderTextColor="#94a3b8"
            multiline
            className="min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-ink"
          />
          <View className="mt-2 flex-row gap-2">
            <Pressable
              disabled={busy || !reason.trim()}
              onPress={() =>
                reject.mutate(
                  { id: ticket.id, reason: reason.trim() },
                  {
                    onSuccess: () => toast.success('Ticket rejected'),
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : 'Reject failed'),
                  },
                )
              }
              className={`flex-1 items-center rounded-lg py-2 ${!reason.trim() || busy ? 'bg-slate-200' : 'bg-red-500 active:opacity-80'}`}
            >
              {reject.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-xs font-semibold text-white">Confirm Reject</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setRejecting(false)}
              className="items-center rounded-lg px-4 py-2 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-slate-400">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="mt-2.5 flex-row gap-2 border-t border-slate-100 pt-2.5">
          <Pressable
            disabled={busy}
            onPress={() =>
              approve.mutate(
                { id: ticket.id },
                {
                  onSuccess: () => toast.success('Ticket approved ✅'),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : 'Approve failed'),
                },
              )
            }
            className={`flex-1 items-center rounded-lg py-2 ${busy ? 'bg-slate-200' : 'bg-green-500 active:opacity-80'}`}
          >
            {approve.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-xs font-semibold text-white">✅ Approve</Text>
            )}
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => setRejecting(true)}
            className="flex-1 items-center rounded-lg border border-red-200 py-2 active:opacity-70"
          >
            <Text className="text-xs font-semibold text-red-500">✖ Reject</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function WorkRow({ item }: { item: WorkItem }) {
  const assignee =
    (item as WorkItem & { assigned_user?: { name?: string } }).assigned_user?.name ??
    'staff';
  return (
    <Link href={`/onehub/my-work/${item.id}` as import('expo-router').Href} asChild>
      <Pressable className="mb-2 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
        <View className="min-w-0 flex-1 pr-2">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {item.title}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-400">
            {assignee} · submitted{' '}
            {item.submitted_at
              ? new Date(item.submitted_at).toLocaleString()
              : '—'}
          </Text>
        </View>
        <Text className="text-slate-400">→</Text>
      </Pressable>
    </Link>
  );
}

export default function ApprovalsScreen() {
  const role = useMyRole();
  const canTickets = TICKET_APPROVER_ROLES.includes(role);
  const canWork = WORK_ADMIN_ROLES.includes(role);

  const tickets = usePendingTickets(canTickets);
  const work = useWorkReviewQueue(canWork);

  const loading =
    (canTickets && tickets.isLoading) || (canWork && work.isLoading);
  const refreshing = tickets.isRefetching || work.isRefetching;
  const refetchAll = () => {
    if (canTickets) void tickets.refetch();
    if (canWork) void work.refetch();
  };

  const pendingTickets = tickets.data?.data ?? [];
  const submissions = work.data?.data ?? [];

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
    >
      {loading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
      ) : (
        <>
          {canTickets ? (
            <>
              <Text className="mb-2 text-base font-bold text-ink">
                🎫 Tickets awaiting approval{' '}
                {pendingTickets.length ? `(${pendingTickets.length})` : ''}
              </Text>
              {tickets.isError ? (
                <Text className="mb-3 text-sm text-red-500">
                  {tickets.error instanceof Error
                    ? tickets.error.message
                    : 'Failed to load tickets'}
                </Text>
              ) : pendingTickets.length === 0 ? (
                <View className="mb-3 items-center rounded-xl border border-slate-200 bg-white p-4">
                  <Text className="text-sm text-slate-400">✅ No pending tickets</Text>
                </View>
              ) : (
                pendingTickets.map((t) => <TicketCard key={t.id} ticket={t} />)
              )}
            </>
          ) : null}

          {canWork ? (
            <>
              <Text className="mb-2 mt-4 text-base font-bold text-ink">
                📋 Work submissions{' '}
                {submissions.length ? `(${submissions.length})` : ''}
              </Text>
              {work.isError ? (
                <Text className="mb-3 text-sm text-red-500">
                  {work.error instanceof Error
                    ? work.error.message
                    : 'Failed to load submissions'}
                </Text>
              ) : submissions.length === 0 ? (
                <View className="items-center rounded-xl border border-slate-200 bg-white p-4">
                  <Text className="text-sm text-slate-400">
                    ✅ Nothing waiting for review
                  </Text>
                </View>
              ) : (
                submissions.map((w) => <WorkRow key={w.id} item={w} />)
              )}
            </>
          ) : null}

          {!canTickets && !canWork ? (
            <View className="mt-10 items-center">
              <Text className="text-sm text-slate-400">
                Your role has no approval duties.
              </Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
