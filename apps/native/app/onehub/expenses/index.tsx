import type { ExpenseClaim, PettyCashTopup } from '@maiyuri/shared';
import { Link } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useMyExpenses } from '@/hooks/use-expenses';
import { SkeletonList } from '@/ui';

const inr = (n: number | null | undefined) =>
  `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

function ClaimRow({ claim }: { claim: ExpenseClaim }) {
  const s = STATUS[claim.status] ?? STATUS.pending;
  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-3.5">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-sm font-semibold text-ink" numberOfLines={1}>
          {claim.expense_type?.icon ?? '🧾'} {claim.expense_type?.name ?? 'Expense'}
        </Text>
        <Text className="text-sm font-bold text-ink">{inr(claim.amount)}</Text>
      </View>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-xs text-slate-400" numberOfLines={1}>
          {claim.expense_date}
          {claim.km ? ` · ${claim.km} km` : ''}
          {claim.project ? ` · ${claim.project.name}` : ''}
        </Text>
        <View className={`rounded-md px-1.5 py-0.5 ${s.cls.split(' ')[0]}`}>
          <Text className={`text-[11px] font-medium ${s.cls.split(' ')[1]}`}>
            {s.label}
          </Text>
        </View>
      </View>
      {claim.status === 'rejected' && claim.reject_reason ? (
        <Text className="mt-1 text-xs text-red-500">✖ {claim.reject_reason}</Text>
      ) : null}
    </View>
  );
}

export default function ExpensesHome() {
  const { data, isLoading, isRefetching, refetch } = useMyExpenses();
  const d = data?.data;

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <SkeletonList count={6} />
      </View>
    );
  }

  const claims = d?.claims ?? [];
  const topups = d?.topups ?? [];

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-10"
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
      }
    >
      {/* Balance card */}
      <View className="rounded-2xl bg-ink p-5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          💰 Available balance
        </Text>
        <Text className="mt-1 text-4xl font-bold text-white">{inr(d?.balance)}</Text>
        <View className="mt-3 flex-row">
          <View className="flex-1">
            <Text className="text-xs text-slate-400">Given</Text>
            <Text className="text-sm font-semibold text-slate-200">
              {inr(d?.topups_total)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-slate-400">Spent</Text>
            <Text className="text-sm font-semibold text-slate-200">
              {inr(d?.spent_total)}
            </Text>
          </View>
        </View>
      </View>

      <Link href={'/onehub/expenses/new' as import('expo-router').Href} asChild>
        <Pressable className="mt-3 items-center rounded-xl bg-brand py-3.5 active:opacity-80">
          <Text className="text-base font-bold text-ink">＋ Add expense</Text>
        </Pressable>
      </Link>

      <Text className="mb-2 mt-5 text-base font-bold text-ink">My expenses</Text>
      {claims.length === 0 ? (
        <View className="items-center rounded-xl border border-slate-200 bg-white p-6">
          <Text className="text-sm text-slate-400">No expenses yet.</Text>
        </View>
      ) : (
        claims.map((c) => <ClaimRow key={c.id} claim={c} />)
      )}

      {topups.length ? (
        <>
          <Text className="mb-2 mt-5 text-base font-bold text-ink">Top-ups received</Text>
          {topups.map((t: PettyCashTopup) => (
            <View
              key={t.id}
              className="mb-2 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5"
            >
              <Text className="text-xs text-slate-500">
                {new Date(t.created_at).toLocaleDateString('en-IN')}
                {t.note ? ` · ${t.note}` : ''}
              </Text>
              <Text className="text-sm font-bold text-green-600">+{inr(t.amount)}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
