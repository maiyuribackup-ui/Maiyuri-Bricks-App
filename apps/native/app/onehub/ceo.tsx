import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { formatINR } from '@/hooks/use-dashboard';
import { useCeoBriefing, type CeoProduct } from '@/hooks/use-ceo';
import { SkeletonList } from '@/ui';

/**
 * 👑 CEO Command Center — money, true product economics, profit periods,
 * pipeline, and ONE AI-picked action from a bricks-industry consultant.
 */

const fmtQty = (n: number) => Math.round(n).toLocaleString('en-IN');

const STAGE_LABELS: Record<string, string> = {
  new: '🆕 New',
  contacted: '📞 Contacted',
  site_visit: '🏗️ Site visit',
  quote_shared: '📄 Quote shared',
  negotiation: '🤝 Negotiation',
  order_won: '🏆 Won',
};

function SectionTitle({ children }: { children: string }) {
  return <Text className="mb-2 mt-3 text-base font-bold text-ink">{children}</Text>;
}

function ProductRow({ p }: { p: CeoProduct }) {
  const tone =
    p.margin_pct >= 40
      ? 'text-green-600'
      : p.margin_pct >= 20
        ? 'text-amber-600'
        : 'text-red-600';
  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-base font-bold text-ink" numberOfLines={1}>
          {p.name}
        </Text>
        <Text className={`text-base font-bold ${tone}`}>
          {p.margin_pct.toFixed(0)}%
        </Text>
      </View>
      <View className="mt-1 flex-row">
        <Text className="flex-1 text-sm text-slate-500">
          Cost {formatINR(p.cost)} → Sells {formatINR(p.price)}
        </Text>
        <Text className={`text-sm font-semibold ${tone}`}>
          {formatINR(p.margin)}/unit
        </Text>
      </View>
      {p.cost_breakdown.length ? (
        <Text className="mt-1 text-xs text-slate-400" numberOfLines={1}>
          {p.cost_breakdown
            .slice(0, 3)
            .map((c) => `${c.material} ${formatINR(c.amount)}`)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

export default function CeoScreen() {
  const router = useRouter();
  const query = useCeoBriefing(true);
  const b = query.data?.data;

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
      {query.isLoading ? (
        <SkeletonList count={6} />
      ) : !b ? (
        <View className="items-center rounded-xl border border-slate-200 bg-white p-6">
          <Text className="text-center text-sm text-red-500">
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load the briefing"}
          </Text>
        </View>
      ) : (
        <>
          {/* 🎯 THE action — the reason this screen exists */}
          <View className="mb-1 rounded-3xl bg-ink p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-wider text-brand">
                🎯 CEO Action · {b.action.urgency === 'today' ? 'TODAY' : 'This week'}
              </Text>
              {!b.action.ai_used ? (
                <Text className="text-xs text-slate-400">rules-based</Text>
              ) : null}
            </View>
            <Text className="mt-2 text-xl font-bold leading-7 text-white">
              {b.action.headline}
            </Text>
            {b.action.why ? (
              <Text className="mt-2 text-sm leading-5 text-slate-300">
                {b.action.why}
              </Text>
            ) : null}
            {b.action.expected_impact ? (
              <Text className="mt-2 text-sm font-semibold text-green-400">
                → {b.action.expected_impact}
              </Text>
            ) : null}
            {b.action.watchlist.length ? (
              <View className="mt-3 border-t border-slate-700 pt-2">
                {b.action.watchlist.map((w) => (
                  <Text key={w} className="text-xs leading-5 text-slate-400">
                    👁 {w}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          {/* 💰 Money */}
          <SectionTitle>💰 Money</SectionTitle>
          {b.money ? (
            <View className="rounded-xl bg-white p-4" style={{ borderWidth: 1, borderColor: '#e2e8f0' }}>
              <View className="flex-row">
                <View className="flex-1">
                  <Text className="text-2xl font-bold text-ink">
                    {formatINR(b.money.bank)}
                  </Text>
                  <Text className="text-xs text-slate-500">Bank</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-2xl font-bold text-ink">
                    {formatINR(b.money.cash)}
                  </Text>
                  <Text className="text-xs text-slate-500">Cash</Text>
                </View>
              </View>
              {b.receivables ? (
                <Text className="mt-2 text-xs text-slate-500">
                  + {formatINR(b.receivables.outstanding)} receivable (
                  <Text className="font-semibold text-red-500">
                    {formatINR(b.receivables.overdue)} overdue / {b.receivables.overdue_count}
                  </Text>
                  )
                </Text>
              ) : null}
            </View>
          ) : (
            <Text className="text-sm text-slate-400">Odoo unavailable</Text>
          )}

          {/* 📈 Profit */}
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="mb-2 text-base font-bold text-ink">
              📈 Profit (invoiced − bills)
            </Text>
            <Pressable
              onPress={() => router.push('/onehub/pnl' as never)}
              className="mb-2 rounded-lg bg-ink px-3 py-1.5 active:opacity-80"
            >
              <Text className="text-xs font-semibold text-white">📑 Full P&L →</Text>
            </Pressable>
          </View>
          {b.profit.map((p) => (
            <View
              key={p.label}
              className="mb-2 flex-row items-center rounded-xl border border-slate-200 bg-white p-4"
            >
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">{p.label}</Text>
                <Text className="text-xs text-slate-400">
                  Rev {formatINR(p.revenue)} · Exp {formatINR(p.expenses)}
                </Text>
              </View>
              <Text
                className={`text-lg font-bold ${p.net >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {formatINR(p.net)}
              </Text>
            </View>
          ))}

          {/* 🧱 Product economics */}
          <SectionTitle>🧱 True cost vs price (worst margin first)</SectionTitle>
          {b.products.length ? (
            b.products.map((p) => <ProductRow key={p.name} p={p} />)
          ) : (
            <Text className="text-sm text-slate-400">
              No BOM data — set up recipes in Odoo
            </Text>
          )}

          {/* 🛒 Pipeline */}
          <SectionTitle>🛒 Sales pipeline</SectionTitle>
          {b.pipeline ? (
            <View className="rounded-xl border border-slate-200 bg-white p-4">
              {b.pipeline.stages.map((s) => (
                <View key={s.stage} className="flex-row justify-between py-1">
                  <Text className="text-sm text-slate-600">
                    {STAGE_LABELS[s.stage] ?? s.stage} ({s.count})
                  </Text>
                  <Text className="text-sm font-semibold text-ink">
                    {formatINR(s.value)}
                  </Text>
                </View>
              ))}
              <View className="mt-2 flex-row justify-between border-t border-slate-100 pt-2">
                <Text className="text-sm font-bold text-ink">
                  Open: {b.pipeline.open_count} leads
                </Text>
                <Text className="text-sm font-bold text-brand">
                  {formatINR(b.pipeline.open_value)}
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-sm text-slate-400">Unavailable</Text>
          )}

          <Text className="mt-3 text-center text-xs text-slate-400">
            Generated {new Date(b.generated_at).toLocaleTimeString('en-IN')} ·
            stock counts: {b.products.map((p) => `${p.name.split('-')[0].trim()} ${fmtQty(p.stock_qty)}`).slice(0, 3).join(' · ')}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
