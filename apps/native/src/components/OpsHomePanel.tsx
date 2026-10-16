import { Text, View } from 'react-native';
import { formatINR } from '@/hooks/use-dashboard';
import type { OpsSnapshot } from '@/hooks/use-ops-home';

/**
 * 🏭 Ops snapshot — the numbers a factory/accounts manager checks first:
 * bank & cash balances, finished-brick stock and cement on hand.
 * Full mode is the home screen for production_supervisor/accountant;
 * compact mode is appended to the founder/owner dashboard.
 */

const fmtQty = (n: number) => Math.round(n).toLocaleString('en-IN');

export function OpsHomePanel({
  data,
  compact = false,
}: {
  data: OpsSnapshot;
  compact?: boolean;
}) {
  const { stock, cement, balances } = data;

  return (
    <View>
      {/* ── Bank & Cash ─────────────────────────────────── */}
      <Text className="mb-2 mt-2 text-base font-bold text-ink">💰 Money</Text>
      {balances ? (
        <View className="mb-3 rounded-xl bg-ink p-4">
          <View className="flex-row">
            <View className="flex-1">
              <Text className="text-2xl font-bold text-white">
                {formatINR(balances.bank)}
              </Text>
              <Text className="text-xs text-slate-400">Bank balance</Text>
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-brand">
                {formatINR(balances.cash)}
              </Text>
              <Text className="text-xs text-slate-400">Cash in hand</Text>
            </View>
          </View>
          {!compact && balances.accounts.length > 1 ? (
            <View className="mt-3 border-t border-slate-700 pt-2">
              {balances.accounts.map((a) => (
                <View key={a.name} className="flex-row justify-between py-0.5">
                  <Text className="text-xs text-slate-300" numberOfLines={1}>
                    {a.type === 'cash' ? '💵' : '🏦'} {a.name}
                  </Text>
                  <Text className="text-xs font-semibold text-slate-200">
                    {formatINR(a.balance)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View className="mb-3 items-center rounded-xl border border-slate-200 bg-white p-4">
          <Text className="text-sm text-slate-400">
            Balances unavailable — Odoo not reachable
          </Text>
        </View>
      )}

      {/* ── Stock ───────────────────────────────────────── */}
      <Text className="mb-2 text-base font-bold text-ink">🧱 Stock on hand</Text>
      <View className="flex-row flex-wrap justify-between">
        {/* Cement first — it's the raw material that stops production. */}
        <View className="mb-3 w-[48.5%] rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-4">
          <Text className="text-3xl font-bold text-ink">
            {cement ? fmtQty(cement.bags) : '—'}
          </Text>
          <Text className="mt-1 text-sm text-slate-500">
            Cement bags{cement ? ` (${fmtQty(cement.kg)} kg)` : ''}
          </Text>
        </View>
        {stock.map((s) => (
          <View
            key={s.name}
            className="mb-3 w-[48.5%] rounded-xl border border-slate-200 border-l-4 border-l-sky-400 bg-white p-4"
          >
            <Text className="text-3xl font-bold text-ink">{fmtQty(s.qty)}</Text>
            <Text className="mt-1 text-sm text-slate-500" numberOfLines={2}>
              {s.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
