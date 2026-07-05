import type { Lead } from '@maiyuri/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatINR,
  useDashboardRevenue,
  useDashboardStats,
} from '@/hooks/use-dashboard';
import { useLeads } from '@/hooks/use-leads';

type CardDef = {
  key: keyof import('@/hooks/use-dashboard').DashboardStats;
  label: string;
  accent: string; // left border colour
  /** Leads-screen view filter this card drills into. */
  view: string;
};

const CARDS: CardDef[] = [
  { key: 'totalLeads', label: 'Total Leads', accent: 'border-l-slate-500', view: 'all' },
  { key: 'hotLeads', label: 'Hot Leads', accent: 'border-l-red-500', view: 'hot' },
  { key: 'dueToday', label: 'Due Today', accent: 'border-l-amber-500', view: 'follow_ups' },
  { key: 'converted', label: 'Converted', accent: 'border-l-green-500', view: 'all' },
  { key: 'newLeads', label: 'New', accent: 'border-l-sky-500', view: 'today' },
  { key: 'followUp', label: 'Follow-up', accent: 'border-l-violet-500', view: 'follow_ups' },
  { key: 'cold', label: 'Cold', accent: 'border-l-blue-400', view: 'cold' },
  { key: 'lost', label: 'Lost', accent: 'border-l-slate-400', view: 'all' },
];

const OPEN_EXCLUDED = new Set(['order_won', 'closed_lost']);
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

type TodayAction = {
  lead: Lead;
  reason: string;
  reasonClass: string; // chip colour classes
};

/**
 * "What should I do right now?" — due/overdue follow-ups first, then hot
 * leads that have gone quiet for 3+ days. Sorted by AI score within groups.
 */
function computeTodayActions(leads: Lead[]): TodayAction[] {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const open = leads.filter((l) => !OPEN_EXCLUDED.has(l.pipeline_stage));
  const byScore = (a: Lead, b: Lead) => (b.ai_score ?? 0) - (a.ai_score ?? 0);

  const due = open
    .filter((l) => l.follow_up_date && new Date(l.follow_up_date) <= endOfToday)
    .sort(byScore)
    .map((lead) => {
      const overdue = new Date(lead.follow_up_date!) < new Date(now.toDateString());
      return {
        lead,
        reason: overdue ? '📅 Overdue' : '📅 Due today',
        reasonClass: overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
      };
    });

  const dueIds = new Set(due.map((a) => a.lead.id));
  const staleHot = open
    .filter(
      (l) =>
        !dueIds.has(l.id) &&
        l.lead_temperature === 'hot' &&
        now.getTime() - new Date(l.updated_at).getTime() > STALE_MS,
    )
    .sort(byScore)
    .map((lead) => ({
      lead,
      reason: '🔥 Hot · gone quiet',
      reasonClass: 'bg-orange-50 text-orange-600',
    }));

  return [...due, ...staleHot].slice(0, 8);
}

function ActionRow({ action, onOpen }: { action: TodayAction; onOpen: () => void }) {
  const { lead, reason, reasonClass } = action;
  return (
    <Pressable
      onPress={onOpen}
      className="mb-2 flex-row items-center rounded-xl border border-slate-200 bg-white p-3 active:opacity-70"
    >
      <View className="min-w-0 flex-1 pr-2">
        <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
          {lead.name}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <View className={`rounded-md px-1.5 py-0.5 ${reasonClass.split(' ')[0]}`}>
            <Text className={`text-xs font-medium ${reasonClass.split(' ')[1]}`}>
              {reason}
            </Text>
          </View>
          {lead.next_action ? (
            <Text className="flex-1 text-xs text-slate-400" numberOfLines={1}>
              → {lead.next_action}
            </Text>
          ) : null}
        </View>
      </View>
      {lead.ai_score != null ? (
        <Text className="mr-2 text-xs font-bold text-slate-400">{lead.ai_score}</Text>
      ) : null}
      <Pressable
        onPress={() => Linking.openURL(`tel:${lead.contact}`)}
        className="h-9 w-9 items-center justify-center rounded-full bg-green-50 active:bg-green-100"
      >
        <Text className="text-sm">📞</Text>
      </Pressable>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useDashboardStats();
  // Reuses the leads cache shared with the Leads tab (same query key).
  const leadsQuery = useLeads({ limit: 100 });
  const revenueQuery = useDashboardRevenue();
  const stats = data?.data;
  const revenue = revenueQuery.data?.data?.revenue;

  const actions = useMemo(
    () => computeTodayActions(leadsQuery.data?.data ?? []),
    [leadsQuery.data],
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (isError || !stats) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Text className="text-center text-red-500">
          {error instanceof Error ? error.message : 'Failed to load dashboard'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-4 rounded-xl bg-brand px-5 py-2.5"
        >
          <Text className="font-semibold text-ink">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || leadsQuery.isRefetching}
            onRefresh={() => {
              void refetch();
              void leadsQuery.refetch();
            }}
          />
        }
      >
        {/* ── Today's Actions ─────────────────────────────── */}
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">⚡ Today's Actions</Text>
          {actions.length > 0 ? (
            <View className="rounded-full bg-brand px-2 py-0.5">
              <Text className="text-xs font-bold text-ink">{actions.length}</Text>
            </View>
          ) : null}
        </View>
        {leadsQuery.isLoading ? (
          <View className="mb-3 items-center rounded-xl border border-slate-200 bg-white p-4">
            <ActivityIndicator color="#f97316" />
          </View>
        ) : actions.length === 0 ? (
          <View className="mb-3 items-center rounded-xl border border-slate-200 bg-white p-4">
            <Text className="text-sm text-slate-400">
              ✅ Nothing due — you're all caught up
            </Text>
          </View>
        ) : (
          <View className="mb-3">
            {actions.map((a) => (
              <ActionRow
                key={a.lead.id}
                action={a}
                onOpen={() => router.push(`/leads/${a.lead.id}`)}
              />
            ))}
          </View>
        )}

        {/* ── Revenue (this month) ────────────────────────── */}
        {revenue ? (
          <View className="mb-3 mt-2 rounded-xl bg-ink p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              💰 This month
            </Text>
            <View className="mt-2 flex-row">
              <View className="flex-1">
                <Text className="text-2xl font-bold text-white">
                  {formatINR(revenue.revenueWon)}
                </Text>
                <Text className="text-xs text-slate-400">Revenue won</Text>
              </View>
              <View className="flex-1">
                <Text className="text-2xl font-bold text-brand">
                  {formatINR(revenue.pipelineValue)}
                </Text>
                <Text className="text-xs text-slate-400">Pipeline value</Text>
              </View>
            </View>
            <View className="mt-3 flex-row">
              <Text className="flex-1 text-xs text-slate-300">
                Avg order {formatINR(revenue.avgOrderValue)}
              </Text>
              <Text className="text-xs text-slate-300">
                Lead→Order {Math.round(revenue.leadToOrderRate)}%
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Stat cards ──────────────────────────────────── */}
        <Text className="mb-2 mt-2 text-base font-bold text-ink">📊 Overview</Text>
        <View className="flex-row flex-wrap justify-between">
          {CARDS.map((card) => (
            <Pressable
              key={card.key}
              onPress={() =>
                router.push({ pathname: '/(tabs)/leads', params: { view: card.view } })
              }
              className={`mb-3 w-[48.5%] rounded-xl border border-slate-200 border-l-4 bg-white p-4 active:opacity-70 ${card.accent}`}
            >
              <Text className="text-3xl font-bold text-ink">
                {stats[card.key] ?? 0}
              </Text>
              <Text className="mt-1 text-sm text-slate-500">{card.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-4 text-center text-xs text-slate-400">
          Tap a card to open filtered leads · pull down to refresh
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
