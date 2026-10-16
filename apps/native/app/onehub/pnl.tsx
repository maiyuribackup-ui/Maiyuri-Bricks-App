import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { formatINR } from '@/hooks/use-dashboard';
import {
  usePnl,
  usePnlLines,
  type PnlAccount,
} from '@/hooks/use-ceo';
import { SkeletonList } from '@/ui';

/**
 * 📑 Monthly P&L from the Odoo general ledger — every income/expense account,
 * tappable down to the individual journal entries. Founder/owner only
 * (the API enforces it).
 */

const istMonth = (): string =>
  new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .slice(0, 7);

const addMonths = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

const prettyMonth = (month: string): string =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const prettyDay = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** One account row; expands to its journal entries on tap. */
function AccountRow({
  acc,
  month,
  kind,
  tone,
}: {
  acc: PnlAccount;
  month: string;
  kind: 'income' | 'expense';
  tone: string;
}) {
  const [open, setOpen] = useState(false);
  const lines = usePnlLines(open ? acc.account_id : null, month, kind);

  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center p-4 active:opacity-70"
      >
        <Text className="mr-2 text-xs text-slate-400">{open ? '▼' : '▶'}</Text>
        <View className="flex-1 pr-2">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {acc.account}
          </Text>
          <Text className="text-xs text-slate-400">
            {acc.entry_count} entr{acc.entry_count === 1 ? 'y' : 'ies'}
          </Text>
        </View>
        <Text className={`text-sm font-bold ${tone}`}>{formatINR(acc.amount)}</Text>
      </Pressable>

      {open ? (
        <View className="border-t border-slate-100 bg-slate-50 px-4 py-2">
          {lines.isLoading ? (
            <ActivityIndicator color="#f97316" className="my-3" />
          ) : (lines.data?.data ?? []).length === 0 ? (
            <Text className="py-2 text-xs text-slate-400">No entries</Text>
          ) : (
            (lines.data?.data ?? []).map((l, i) => (
              <View
                key={`${l.move}-${i}`}
                className="flex-row items-start border-b border-slate-100 py-2 last:border-b-0"
              >
                <View className="flex-1 pr-2">
                  <Text className="text-xs font-semibold text-ink" numberOfLines={1}>
                    {l.move}
                    {l.partner ? ` · ${l.partner}` : ''}
                  </Text>
                  <Text className="text-xs text-slate-500" numberOfLines={1}>
                    {prettyDay(l.date)}
                    {l.label ? ` — ${l.label}` : ''}
                  </Text>
                </View>
                <Text
                  className={`text-xs font-bold ${l.amount < 0 ? 'text-green-600' : 'text-ink'}`}
                >
                  {formatINR(l.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function PnlScreen() {
  const [month, setMonth] = useState(istMonth());
  const query = usePnl(month);
  const pnl = query.data?.data;
  const isCurrent = month === istMonth();

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        />
      }
    >
      {/* Month switcher */}
      <View className="mb-3 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
        <Pressable
          onPress={() => setMonth((m) => addMonths(m, -1))}
          className="h-10 w-10 items-center justify-center rounded-lg active:bg-slate-100"
        >
          <Text className="text-lg text-ink">‹</Text>
        </Pressable>
        <Text className="text-base font-bold text-ink">{prettyMonth(month)}</Text>
        <Pressable
          onPress={() => setMonth((m) => addMonths(m, 1))}
          disabled={isCurrent}
          className={`h-10 w-10 items-center justify-center rounded-lg ${isCurrent ? 'opacity-30' : 'active:bg-slate-100'}`}
        >
          <Text className="text-lg text-ink">›</Text>
        </Pressable>
      </View>

      {query.isLoading ? (
        <SkeletonList count={6} />
      ) : !pnl ? (
        <View className="items-center rounded-xl border border-slate-200 bg-white p-6">
          <Text className="text-center text-sm text-red-500">
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load the P&L"}
          </Text>
          <Pressable
            onPress={() => void query.refetch()}
            className="mt-3 rounded-xl bg-brand px-5 py-2.5 active:opacity-80"
          >
            <Text className="font-semibold text-ink">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Headline */}
          <View className="mb-3 rounded-2xl bg-ink p-4">
            <View className="flex-row">
              <View className="flex-1">
                <Text className="text-lg font-bold text-white">
                  {formatINR(pnl.revenue.total)}
                </Text>
                <Text className="text-xs text-slate-400">Revenue</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-white">
                  {formatINR(pnl.expenses.total)}
                </Text>
                <Text className="text-xs text-slate-400">Expenses</Text>
              </View>
              <View className="flex-1">
                <Text
                  className={`text-lg font-bold ${pnl.net >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {formatINR(pnl.net)}
                </Text>
                <Text className="text-xs text-slate-400">
                  {pnl.net >= 0 ? 'Profit' : 'Loss'}
                </Text>
              </View>
            </View>
          </View>

          {/* Income accounts */}
          <Text className="mb-2 text-base font-bold text-ink">💵 Income</Text>
          {pnl.revenue.accounts.length === 0 ? (
            <Text className="mb-2 text-sm text-slate-400">No income entries</Text>
          ) : (
            pnl.revenue.accounts.map((a) => (
              <AccountRow
                key={a.account_id}
                acc={a}
                month={month}
                kind="income"
                tone="text-green-600"
              />
            ))
          )}

          {/* Expense accounts */}
          <Text className="mb-2 mt-3 text-base font-bold text-ink">
            💸 Expenses — tap to see journal entries
          </Text>
          {pnl.expenses.accounts.length === 0 ? (
            <Text className="text-sm text-slate-400">No expense entries</Text>
          ) : (
            pnl.expenses.accounts.map((a) => (
              <AccountRow
                key={a.account_id}
                acc={a}
                month={month}
                kind="expense"
                tone="text-red-600"
              />
            ))
          )}

          <Text className="mt-3 text-center text-xs text-slate-400">
            Posted journal entries only · {pnl.from} → {pnl.to}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
