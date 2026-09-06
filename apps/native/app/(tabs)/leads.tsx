import type { Lead, LeadTemperature, PipelineStage } from '@maiyuri/shared';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteLeads } from '@/hooks/use-leads';
import { QuickActionsModal } from '@/components/LeadQuickActions';

// ---------- helpers ----------

const TEMP_META: Record<LeadTemperature, { emoji: string; avatar: string; chip: string; rail: string }> = {
  hot: { emoji: '🔥', avatar: 'bg-red-500', chip: 'bg-red-50 text-red-700', rail: 'bg-red-500' },
  warm: { emoji: '🌤️', avatar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', rail: 'bg-amber-500' },
  cold: { emoji: '❄️', avatar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', rail: 'bg-sky-500' },
};

const STAGE_ICON: Record<string, string> = {
  new_inquiry: '🌱',
  qualified_lead: '✅',
  quote_shared: '📄',
  factory_visit_proof: '🏭',
  decision_pending: '🤔',
  finalisation: '🤝',
  order_won: '🏆',
  closed_lost: '❌',
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  new_inquiry: 'New',
  qualified_lead: 'Qualified',
  quote_shared: 'Quote',
  factory_visit_proof: 'Proof',
  decision_pending: 'Decision',
  finalisation: 'Finalise',
  order_won: 'Won',
  closed_lost: 'Lost',
};

const STAGE_TONE: Record<string, string> = {
  new_inquiry: 'bg-emerald-50 text-emerald-700',
  qualified_lead: 'bg-lime-50 text-lime-700',
  quote_shared: 'bg-orange-50 text-orange-700',
  factory_visit_proof: 'bg-blue-50 text-blue-700',
  decision_pending: 'bg-violet-50 text-violet-700',
  finalisation: 'bg-green-50 text-green-700',
  order_won: 'bg-green-100 text-green-800',
  closed_lost: 'bg-slate-100 text-slate-600',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function titleCase(s?: string | null): string {
  return (s ?? '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function callLead(contact: string) {
  void Linking.openURL(`tel:${contact}`);
}

function whatsappLead(contact: string) {
  const digits = contact.replace(/[^0-9]/g, '');
  const withCc = digits.length === 10 ? `91${digits}` : digits;
  void Linking.openURL(`https://wa.me/${withCc}`);
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function isOverdue(iso?: string | null): boolean {
  if (!iso) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso) < today;
}

function ageLabel(iso?: string | null): string {
  if (!iso) return 'No update';
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function leadLocation(lead: Lead): string {
  return lead.site_region || lead.site_location || lead.source || 'Location pending';
}

function leadPriorityText(lead: Lead): string {
  if (lead.follow_up_date && isOverdue(lead.follow_up_date)) return 'Overdue follow-up';
  if (lead.follow_up_date) return `Due ${formatShortDate(lead.follow_up_date)}`;
  if (lead.pipeline_stage === 'qualified_lead') return 'Quote needed';
  if (lead.pipeline_stage === 'factory_visit_proof') return 'Proof/visit push';
  if (lead.pipeline_stage === 'decision_pending') return 'Decision chase';
  if (!lead.next_action) return 'Set next action';
  return ageLabel(lead.updated_at);
}

function boardCounts(leads: Lead[]) {
  const open = leads.filter((l) => !OPEN_STAGES_EXCLUDED.has(l.pipeline_stage));
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return {
    total: leads.length,
    open: open.length,
    hot: open.filter((l) => l.lead_temperature === 'hot').length,
    due: open.filter((l) => l.follow_up_date && new Date(l.follow_up_date) <= end).length,
    quote: open.filter((l) => ['qualified_lead', 'quote_shared'].includes(l.pipeline_stage)).length,
  };
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View className={`mr-2 min-w-[74px] rounded-2xl px-3 py-2 ${tone}`}>
      <Text className="text-xl font-extrabold text-ink">{value}</Text>
      <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</Text>
    </View>
  );
}

function LeadsBoardHeader({ leads, visibleCount }: { leads: Lead[]; visibleCount: number }) {
  const c = boardCounts(leads);
  return (
    <View className="mb-3 rounded-3xl bg-ink p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-bold uppercase tracking-[2px] text-brand">Lead Board</Text>
          <Text className="mt-1 text-2xl font-extrabold text-white">{visibleCount} in view</Text>
          <Text className="mt-1 text-xs leading-5 text-slate-300">
            Compact pipeline view — call, WhatsApp, AI and quick actions stay one tap away.
          </Text>
        </View>
        <View className="rounded-2xl bg-white/10 px-3 py-2">
          <Text className="text-center text-lg font-extrabold text-brand">{c.open}</Text>
          <Text className="text-[10px] font-bold uppercase text-slate-300">open</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
        <MiniMetric label="Total" value={c.total} tone="bg-white" />
        <MiniMetric label="Hot" value={c.hot} tone="bg-red-100" />
        <MiniMetric label="Due" value={c.due} tone="bg-amber-100" />
        <MiniMetric label="Quote" value={c.quote} tone="bg-orange-100" />
      </ScrollView>
    </View>
  );
}

function PipelineDots({ stage }: { stage: PipelineStage }) {
  const stages: PipelineStage[] = ['new_inquiry', 'qualified_lead', 'quote_shared', 'factory_visit_proof', 'decision_pending', 'finalisation'];
  const idx = Math.max(0, stages.indexOf(stage));
  return (
    <View className="mt-2 flex-row items-center gap-1">
      {stages.map((s, i) => (
        <View
          key={s}
          className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-brand' : 'bg-slate-200'}`}
        />
      ))}
    </View>
  );
}

// ---------- AI summary modal ----------

function AISummaryModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  return (
    <Modal visible={!!lead} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[80%] rounded-t-3xl bg-white">
          <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                ✨ AI Summary
              </Text>
              <Text className="text-sm text-slate-500" numberOfLines={1}>
                {lead?.name}
              </Text>
            </View>
            {lead?.ai_score != null ? (
              <View
                className={`h-12 w-12 items-center justify-center rounded-full ${scoreColor(lead.ai_score)}`}
              >
                <Text className="text-base font-bold text-white">{lead.ai_score}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView className="px-5 py-4" contentContainerClassName="pb-8">
            {lead?.ai_summary ? (
              <Text className="text-base leading-6 text-slate-700">{lead.ai_summary}</Text>
            ) : (
              <Text className="text-slate-400">No AI summary yet for this lead.</Text>
            )}

            {lead?.ai_factors?.length ? (
              <View className="mt-5">
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Factors
                </Text>
                {lead.ai_factors.map((f, i) => (
                  <View key={i} className="mb-1.5 flex-row items-start">
                    <Text className="mr-2">
                      {f.impact === 'positive' ? '🟢' : f.impact === 'negative' ? '🔴' : '⚪'}
                    </Text>
                    <Text className="flex-1 text-sm text-slate-600">{f.factor}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {lead?.ai_suggestions?.length ? (
              <View className="mt-5">
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Suggested actions
                </Text>
                {lead.ai_suggestions.map((s, i) => (
                  <View key={i} className="mb-2 rounded-xl bg-violet-50 p-3">
                    <Text className="text-sm text-violet-900">{s.content}</Text>
                    <Text className="mt-0.5 text-xs uppercase text-violet-400">
                      {s.priority} priority
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {lead?.next_action ? (
              <View className="mt-5 rounded-xl bg-purple-50 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-purple-400">
                  Next action
                </Text>
                <Text className="mt-1 text-sm text-purple-900">{lead.next_action}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="border-t border-slate-100 p-4">
            <Pressable
              onPress={onClose}
              className="items-center rounded-xl bg-ink py-3 active:opacity-80"
            >
              <Text className="font-semibold text-white">Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- lead card ----------

function LeadRow({
  lead,
  onAiSummary,
  onQuickActions,
}: {
  lead: Lead;
  onAiSummary: (l: Lead) => void;
  onQuickActions: (l: Lead) => void;
}) {
  const temp = TEMP_META[lead.lead_temperature] ?? TEMP_META.cold;
  const stageIcon = STAGE_ICON[lead.pipeline_stage] ?? '📌';
  const stageTone = STAGE_TONE[lead.pipeline_stage] ?? 'bg-slate-100 text-slate-600';
  const [stageBg, stageText] = stageTone.split(' ');
  const [tempBg, tempText] = temp.chip.split(' ');
  const hasAi = !!(lead.ai_summary || lead.ai_score != null);
  const overdue = isOverdue(lead.follow_up_date);

  return (
    <View className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <View className={`h-1.5 ${temp.rail}`} />
      <View className="p-3">
        <Link href={`/leads/${lead.id}`} asChild>
          <Pressable className="active:opacity-70">
            <View className="flex-row items-start">
              <View className="relative mr-3">
                <View className={`h-10 w-10 items-center justify-center rounded-2xl ${temp.avatar}`}>
                  <Text className="text-xs font-extrabold text-white">{initials(lead.name)}</Text>
                </View>
                <View className="absolute -bottom-1 -right-1 rounded-full bg-white">
                  <Text className="text-sm">{temp.emoji}</Text>
                </View>
              </View>

              <View className="min-w-0 flex-1">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-extrabold text-ink" numberOfLines={1}>
                      {lead.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                      📍 {leadLocation(lead)} · {lead.contact}
                    </Text>
                  </View>
                  {lead.ai_score != null ? (
                    <View className={`h-9 w-9 items-center justify-center rounded-2xl ${scoreColor(lead.ai_score)}`}>
                      <Text className="text-xs font-extrabold text-white">{lead.ai_score}</Text>
                    </View>
                  ) : null}
                </View>

                <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                  <View className={`rounded-full px-2 py-0.5 ${tempBg}`}>
                    <Text className={`text-[11px] font-bold ${tempText}`}>{titleCase(lead.lead_temperature)}</Text>
                  </View>
                  <View className={`rounded-full px-2 py-0.5 ${stageBg}`}>
                    <Text className={`text-[11px] font-bold ${stageText}`}>
                      {stageIcon} {STAGE_LABEL[lead.pipeline_stage] ?? titleCase(lead.pipeline_stage)}
                    </Text>
                  </View>
                  <View className={`rounded-full px-2 py-0.5 ${overdue ? 'bg-red-50' : 'bg-slate-100'}`}>
                    <Text className={`text-[11px] font-bold ${overdue ? 'text-red-700' : 'text-slate-600'}`}>
                      {leadPriorityText(lead)}
                    </Text>
                  </View>
                </View>

                <PipelineDots stage={lead.pipeline_stage} />

                {lead.next_action ? (
                  <Text className="mt-2 text-xs leading-4 text-purple-700" numberOfLines={2}>
                    → {lead.next_action}
                  </Text>
                ) : (
                  <Text className="mt-2 text-xs text-slate-400">→ Next action not set</Text>
                )}
              </View>
            </View>
          </Pressable>
        </Link>

        <View className="mt-3 flex-row items-center justify-between border-t border-slate-100 pt-2.5">
          <View className="min-w-0 flex-1 pr-2">
            <Text className="text-[11px] font-semibold text-slate-400" numberOfLines={1}>
              {lead.source ? `${lead.source} · ` : ''}Updated {ageLabel(lead.updated_at)}
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={() => onQuickActions(lead)}
              className="h-8 min-w-[34px] items-center justify-center rounded-full bg-amber-50 px-2 active:bg-amber-100"
            >
              <Text className="text-sm">⚡</Text>
            </Pressable>
            {hasAi ? (
              <Pressable
                onPress={() => onAiSummary(lead)}
                className="h-8 min-w-[34px] items-center justify-center rounded-full bg-violet-50 px-2 active:bg-violet-100"
              >
                <Text className="text-sm">✨</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => callLead(lead.contact)}
              className="h-8 min-w-[34px] items-center justify-center rounded-full bg-green-50 px-2 active:bg-green-100"
            >
              <Text className="text-sm">📞</Text>
            </Pressable>
            <Pressable
              onPress={() => whatsappLead(lead.contact)}
              className="h-8 min-w-[34px] items-center justify-center rounded-full bg-emerald-50 px-2 active:bg-emerald-100"
            >
              <Text className="text-sm">💬</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------- filters / sort ----------

type ViewFilter = 'all' | 'today' | 'follow_ups' | 'hot' | 'warm' | 'cold' | 'attention';
type SortKey = 'created_at' | 'updated_at' | 'ai_score' | 'name';

const VIEW_TABS: { value: ViewFilter; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '📋' },
  { value: 'today', label: 'Today', icon: '📅' },
  { value: 'follow_ups', label: 'Due Follow-ups', icon: '📞' },
  { value: 'hot', label: 'Hot', icon: '🔥' },
  { value: 'warm', label: 'Warm', icon: '🌤️' },
  { value: 'cold', label: 'Cold', icon: '❄️' },
  { value: 'attention', label: 'Attention', icon: '⚠️' },
];

const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: 'created_at', label: 'Newest' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'ai_score', label: 'AI Score' },
  { key: 'name', label: 'Name' },
];

const OPEN_STAGES_EXCLUDED = new Set(['order_won', 'closed_lost']);

function isSameDay(iso: string | null | undefined, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function applyView(leads: Lead[], view: ViewFilter): Lead[] {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const staleMs = 7 * 24 * 60 * 60 * 1000;

  switch (view) {
    case 'today':
      return leads.filter(
        (l) => isSameDay(l.created_at, now) || isSameDay(l.updated_at, now),
      );
    case 'follow_ups':
      return leads.filter(
        (l) => l.follow_up_date && new Date(l.follow_up_date) <= endOfToday,
      );
    case 'hot':
    case 'warm':
    case 'cold':
      return leads.filter((l) => l.lead_temperature === view);
    case 'attention':
      return leads.filter(
        (l) =>
          !OPEN_STAGES_EXCLUDED.has(l.pipeline_stage) &&
          now.getTime() - new Date(l.updated_at).getTime() > staleMs,
      );
    default:
      return leads;
  }
}

function sortLeads(leads: Lead[], key: SortKey, dir: 'asc' | 'desc'): Lead[] {
  const sorted = [...leads].sort((a, b) => {
    let cmp = 0;
    if (key === 'name') cmp = a.name.localeCompare(b.name);
    else if (key === 'ai_score') cmp = (a.ai_score ?? 0) - (b.ai_score ?? 0);
    else cmp = new Date(a[key]).getTime() - new Date(b[key]).getTime();
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// ---------- screen ----------

const VIEW_VALUES = new Set(VIEW_TABS.map((t) => t.value as string));

export default function LeadsScreen() {
  // Deep-link / dashboard-card drill-in: /(tabs)/leads?view=hot
  const params = useLocalSearchParams<{ view?: string }>();
  const [search, setSearch] = useState('');
  const [aiLead, setAiLead] = useState<Lead | null>(null);
  const [qaLead, setQaLead] = useState<Lead | null>(null);
  const [view, setView] = useState<ViewFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupByTemp, setGroupByTemp] = useState(false);

  // Apply the incoming view param whenever it changes (tapping a different
  // dashboard card while this tab is mounted must still switch the filter).
  useEffect(() => {
    if (params.view && VIEW_VALUES.has(params.view)) {
      setView(params.view as ViewFilter);
    }
  }, [params.view]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteLeads({ search: search || undefined });

  const allLeads = useMemo(
    () => data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [data],
  );

  const onSortTap = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sections = useMemo(() => {
    const filtered = sortLeads(applyView(allLeads, view), sortKey, sortDir);
    if (!groupByTemp) {
      return [{ title: null as string | null, data: filtered }];
    }
    const order: LeadTemperature[] = ['hot', 'warm', 'cold'];
    return order
      .map((t) => ({
        title: `${TEMP_META[t].emoji} ${titleCase(t)} (${filtered.filter((l) => l.lead_temperature === t).length})`,
        data: filtered.filter((l) => l.lead_temperature === t),
      }))
      .filter((s) => s.data.length > 0);
  }, [allLeads, view, sortKey, sortDir, groupByTemp]);

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <View className="border-b border-slate-200 bg-canvas px-4 pb-2 pt-3">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, phone, location…"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
          />
          <Pressable
            onPress={() => setGroupByTemp((g) => !g)}
            className={`h-11 items-center justify-center rounded-2xl px-3 ${groupByTemp ? 'bg-ink' : 'border border-slate-200 bg-white'}`}
          >
            <Text className={`text-xs font-bold ${groupByTemp ? 'text-white' : 'text-slate-600'}`}>🌡️</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 max-h-10">
          {VIEW_TABS.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setView(t.value)}
              className={`mr-2 flex-row items-center rounded-full px-3 py-1.5 ${
                view === t.value ? 'bg-ink' : 'bg-white border border-slate-200'
              }`}
            >
              <Text className="mr-1 text-xs">{t.icon}</Text>
              <Text className={`text-xs font-bold ${view === t.value ? 'text-white' : 'text-slate-600'}`}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1 max-h-9">
          <Text className="mr-2 self-center text-[11px] font-semibold text-slate-400">Sort</Text>
          {SORT_TABS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => onSortTap(s.key)}
              className={`mr-2 rounded-full px-2.5 py-1 ${sortKey === s.key ? 'bg-brand' : 'bg-white/70'}`}
            >
              <Text className={`text-[11px] font-bold ${sortKey === s.key ? 'text-ink' : 'text-slate-500'}`}>
                {s.label}{sortKey === s.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-red-500">
            {error instanceof Error ? error.message : 'Failed to load leads'}
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="mt-4 rounded-xl bg-brand px-5 py-2.5"
          >
            <Text className="font-semibold text-ink">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LeadRow lead={item} onAiSummary={setAiLead} onQuickActions={setQaLead} />
          )}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <Text className="bg-canvas px-1 pb-2 pt-3 text-sm font-extrabold text-slate-500">
                {section.title}
              </Text>
            ) : null
          }
          ListHeaderComponent={
            <LeadsBoardHeader
              leads={allLeads}
              visibleCount={sections.reduce((n, section) => n + section.data.length, 0)}
            />
          }
          contentContainerClassName="px-4 pb-6 pt-3"
          stickySectionHeadersEnabled={false}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator className="py-4" color="#f97316" />
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <View className="mt-10 items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6">
              <Text className="text-center text-base font-bold text-ink">No leads in this view</Text>
              <Text className="mt-1 text-center text-sm text-slate-400">Try All, clear search, or change the stage filter.</Text>
            </View>
          }
        />
      )}

      <AISummaryModal lead={aiLead} onClose={() => setAiLead(null)} />
      <QuickActionsModal lead={qaLead} onClose={() => setQaLead(null)} />
    </SafeAreaView>
  );
}
