import type { Lead, PipelineStage } from '@maiyuri/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { useMyWork } from '@/hooks/use-my-work';
import { useMyProfile } from '@/hooks/use-push-settings';
import { OPS_HOME_ROLES, useOpsSnapshot } from '@/hooks/use-ops-home';
import { useAuth } from '@/store/auth';
import { OpsHomePanel } from '@/components/OpsHomePanel';
import { TaskFirstHome } from '@/components/TaskFirstHome';
import { SkeletonList } from '@/ui';

type SalesFocus = 'all' | 'close_now' | 'trust' | 'quote' | 'cleanup';

const OPEN_EXCLUDED = new Set(['order_won', 'closed_lost']);
const STALE_MS = 3 * 24 * 60 * 60 * 1000;
const CLEANUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const STAGE_LABELS: Record<PipelineStage, string> = {
  new_inquiry: 'New',
  qualified_lead: 'Qualified',
  quote_shared: 'Quote',
  factory_visit_proof: 'Proof',
  decision_pending: 'Decision',
  finalisation: 'Finalise',
  order_won: 'Won',
  closed_lost: 'Lost',
};

const FUNNEL_STAGES: PipelineStage[] = [
  'new_inquiry',
  'qualified_lead',
  'quote_shared',
  'factory_visit_proof',
  'decision_pending',
  'finalisation',
  'order_won',
  'closed_lost',
];

type SalesAction = {
  lead: Lead;
  reason: string;
  reasonClass: string;
  category: SalesFocus;
  insight: string;
  daysLate?: number;
};

type SalesMetrics = {
  total: number;
  open: number;
  hot: number;
  warm: number;
  cold: number;
  overdue: number;
  dueToday: number;
  noNextDate: number;
  stale: number;
  quoteStage: number;
  proofStage: number;
  decisionStage: number;
  won: number;
  lost: number;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfToday().getTime();
  // Anchor b to start-of-day semantics used for overdue badges.
  const bx = new Date(b);
  bx.setHours(0, 0, 0, 0);
  const ax = new Date(a);
  ax.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((bx.getTime() - ax.getTime()) / 86_400_000) || Math.floor((ms - ax.getTime()) / 86_400_000));
}

function ageDays(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function isOpenLead(lead: Lead) {
  return !OPEN_EXCLUDED.has(lead.pipeline_stage);
}

function hasFollowUpDue(lead: Lead) {
  return !!lead.follow_up_date && new Date(lead.follow_up_date) <= endOfToday();
}

function isOverdue(lead: Lead) {
  return !!lead.follow_up_date && new Date(lead.follow_up_date) < startOfToday();
}

function stageLabel(stage?: PipelineStage | null) {
  return stage ? STAGE_LABELS[stage] ?? stage.replaceAll('_', ' ') : 'Unknown';
}

function titleCase(value?: string | null) {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function computeSalesMetrics(leads: Lead[], fallback?: Partial<SalesMetrics>): SalesMetrics {
  const open = leads.filter(isOpenLead);
  return {
    total: fallback?.total ?? leads.length,
    open: open.length,
    hot: open.filter((l) => l.lead_temperature === 'hot').length,
    warm: open.filter((l) => l.lead_temperature === 'warm').length,
    cold: open.filter((l) => l.lead_temperature === 'cold').length,
    overdue: open.filter(isOverdue).length,
    dueToday: open.filter((l) => hasFollowUpDue(l) && !isOverdue(l)).length,
    noNextDate: open.filter((l) => !l.follow_up_date).length,
    stale: open.filter((l) => ageDays(l.updated_at) >= 7).length,
    quoteStage: open.filter((l) => l.pipeline_stage === 'quote_shared').length,
    proofStage: open.filter((l) => l.pipeline_stage === 'factory_visit_proof').length,
    decisionStage: open.filter((l) => l.pipeline_stage === 'decision_pending').length,
    won: leads.filter((l) => l.pipeline_stage === 'order_won').length,
    lost: leads.filter((l) => l.pipeline_stage === 'closed_lost').length,
  };
}

function computeSalesActions(leads: Lead[]): SalesAction[] {
  const open = leads.filter(isOpenLead);
  const byScore = (a: Lead, b: Lead) => (b.ai_score ?? 0) - (a.ai_score ?? 0);

  const due = open
    .filter(hasFollowUpDue)
    .sort(byScore)
    .map((lead) => {
      const overdue = isOverdue(lead);
      const late = lead.follow_up_date
        ? daysBetween(new Date(lead.follow_up_date), new Date())
        : undefined;
      const hotClose =
        lead.lead_temperature === 'hot' ||
        ['quote_shared', 'decision_pending', 'finalisation'].includes(lead.pipeline_stage);
      return {
        lead,
        reason: overdue ? `📅 Overdue${late ? ` ${late}d` : ''}` : '📅 Due today',
        reasonClass: overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
        category: hotClose ? ('close_now' as const) : ('cleanup' as const),
        insight: hotClose
          ? 'Close movement: call, confirm objection, and set next commitment.'
          : 'Follow-up hygiene: contact and set a clear next date.',
        daysLate: overdue ? late : undefined,
      };
    });

  const dueIds = new Set(due.map((a) => a.lead.id));

  const quote = open
    .filter(
      (l) =>
        !dueIds.has(l.id) &&
        (l.pipeline_stage === 'qualified_lead' ||
          l.pipeline_stage === 'quote_shared' ||
          /quote|estimate|rate|price|recalculat/i.test(l.next_action ?? '')),
    )
    .sort(byScore)
    .slice(0, 6)
    .map((lead) => ({
      lead,
      reason: lead.pipeline_stage === 'qualified_lead' ? '💰 Quote pending' : '💰 Quote follow-up',
      reasonClass: 'bg-orange-50 text-orange-600',
      category: 'quote' as const,
      insight: 'Move from interest to number: share/revise quote and ask for decision date.',
    }));

  const quoteIds = new Set([...dueIds, ...quote.map((a) => a.lead.id)]);

  const trust = open
    .filter(
      (l) =>
        !quoteIds.has(l.id) &&
        (l.pipeline_stage === 'factory_visit_proof' ||
          l.factory_visit_status === 'invited' ||
          l.factory_visit_status === 'scheduled' ||
          l.best_conversion_lever === 'proof' ||
          l.best_conversion_lever === 'visit'),
    )
    .sort(byScore)
    .slice(0, 5)
    .map((lead) => ({
      lead,
      reason: '🧱 Proof needed',
      reasonClass: 'bg-blue-50 text-blue-600',
      category: 'trust' as const,
      insight: 'Build trust: push factory visit, sample, site photo, or proof content.',
    }));

  const usedIds = new Set([...quoteIds, ...trust.map((a) => a.lead.id)]);

  const staleHot = open
    .filter(
      (l) =>
        !usedIds.has(l.id) &&
        l.lead_temperature === 'hot' &&
        Date.now() - new Date(l.updated_at).getTime() > STALE_MS,
    )
    .sort(byScore)
    .map((lead) => ({
      lead,
      reason: '🔥 Hot · quiet',
      reasonClass: 'bg-red-50 text-red-600',
      category: 'close_now' as const,
      insight: 'Hot lead is going cold — call before competitor captures the decision.',
    }));

  const staleIds = new Set([...usedIds, ...staleHot.map((a) => a.lead.id)]);

  const cleanup = open
    .filter(
      (l) =>
        !staleIds.has(l.id) &&
        (!l.follow_up_date || Date.now() - new Date(l.updated_at).getTime() > CLEANUP_STALE_MS),
    )
    .sort(byScore)
    .slice(0, 5)
    .map((lead) => ({
      lead,
      reason: !lead.follow_up_date ? '🧹 No next date' : '🧹 Stale lead',
      reasonClass: 'bg-slate-100 text-slate-600',
      category: 'cleanup' as const,
      insight: 'Clean CRM: set next action/date or mark lost with reason.',
    }));

  return [...due, ...staleHot, ...quote, ...trust, ...cleanup].slice(0, 15);
}

function salesInsights(metrics: SalesMetrics) {
  const list: { tone: string; title: string; body: string }[] = [];
  if (metrics.overdue > 0) {
    list.push({
      tone: 'bg-red-50 border-red-100',
      title: `${metrics.overdue} overdue follow-ups`,
      body: 'Clear these before 11 AM. Every late callback lowers trust.',
    });
  }
  if (metrics.quoteStage + metrics.decisionStage > 0) {
    list.push({
      tone: 'bg-orange-50 border-orange-100',
      title: `${metrics.quoteStage + metrics.decisionStage} quote/decision leads`,
      body: 'Ask: price objection, delivery date, or family/engineer approval?',
    });
  }
  if (metrics.proofStage > 0) {
    list.push({
      tone: 'bg-blue-50 border-blue-100',
      title: `${metrics.proofStage} proof-stage leads`,
      body: 'Push factory visit, sample, lab/proof, or relevant customer example.',
    });
  }
  if (metrics.noNextDate > 0) {
    list.push({
      tone: 'bg-slate-50 border-slate-200',
      title: `${metrics.noNextDate} leads without next date`,
      body: 'Set a follow-up date or close them with a reason to keep the funnel honest.',
    });
  }
  if (!list.length) {
    list.push({
      tone: 'bg-green-50 border-green-100',
      title: 'Sales rhythm clean',
      body: 'No urgent leakage detected. Work hot and warm leads by AI score.',
    });
  }
  return list.slice(0, 4);
}

function MetricChip({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <View className={`mr-2 mt-2 rounded-xl px-3 py-2 ${tone}`}>
      <Text className="text-xl font-bold text-ink">{value}</Text>
      <Text className="text-[11px] font-semibold text-slate-500">{label}</Text>
    </View>
  );
}

function SalesPulseCard({ metrics, pipelineValue }: { metrics: SalesMetrics; pipelineValue?: number }) {
  return (
    <View className="mb-3 rounded-2xl bg-ink p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-brand">Sales Pulse</Text>
          <Text className="mt-1 text-2xl font-bold text-white">Open leads: {metrics.open}</Text>
          <Text className="mt-1 text-xs text-slate-300">
            Hot {metrics.hot} · Warm {metrics.warm} · Cold {metrics.cold}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-slate-400">Pipeline</Text>
          <Text className="text-xl font-bold text-brand">{formatINR(pipelineValue ?? 0)}</Text>
        </View>
      </View>
      <View className="mt-2 flex-row flex-wrap">
        <MetricChip label="Overdue" value={metrics.overdue} tone="bg-red-100" />
        <MetricChip label="Due today" value={metrics.dueToday} tone="bg-amber-100" />
        <MetricChip label="Quotes" value={metrics.quoteStage} tone="bg-orange-100" />
        <MetricChip label="No date" value={metrics.noNextDate} tone="bg-slate-100" />
      </View>
    </View>
  );
}

function FunnelSnapshot({ leads }: { leads: Lead[] }) {
  const counts = FUNNEL_STAGES.map((stage) => ({
    stage,
    label: stageLabel(stage),
    count: leads.filter((l) => l.pipeline_stage === stage).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-base font-bold text-ink">Funnel Snapshot</Text>
        <Text className="text-xs font-semibold text-slate-400">{leads.length} loaded</Text>
      </View>
      {counts.map((row) => (
        <View key={row.stage} className="mb-2 flex-row items-center">
          <Text className="w-20 text-xs font-semibold text-slate-500">{row.label}</Text>
          <View className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <View
              className={`h-3 rounded-full ${
                row.stage === 'order_won'
                  ? 'bg-green-500'
                  : row.stage === 'closed_lost'
                    ? 'bg-slate-400'
                    : row.stage === 'new_inquiry'
                      ? 'bg-sky-400'
                      : 'bg-brand'
              }`}
              style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
            />
          </View>
          <Text className="ml-2 w-7 text-right text-xs font-bold text-ink">{row.count}</Text>
        </View>
      ))}
    </View>
  );
}

function SalesCoach({ metrics }: { metrics: SalesMetrics }) {
  return (
    <View className="mb-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-bold text-ink">AI Sales Coach</Text>
        <Text className="text-xs text-slate-400">Action insights</Text>
      </View>
      {salesInsights(metrics).map((item) => (
        <View key={item.title} className={`mb-2 rounded-xl border p-3 ${item.tone}`}>
          <Text className="text-sm font-bold text-ink">{item.title}</Text>
          <Text className="mt-1 text-xs leading-5 text-slate-600">{item.body}</Text>
        </View>
      ))}
    </View>
  );
}

function FocusPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 rounded-full px-3 py-1.5 ${active ? 'bg-ink' : 'border border-slate-200 bg-white'}`}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>{label}</Text>
    </Pressable>
  );
}

function ActionRow({ action, onOpen }: { action: SalesAction; onOpen: () => void }) {
  const { lead, reason, reasonClass, insight } = action;
  const [reasonBg, reasonText] = reasonClass.split(' ');
  return (
    <Pressable
      onPress={onOpen}
      className="mb-2 rounded-xl border border-slate-200 bg-white p-3 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {lead.name}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1}>
            {stageLabel(lead.pipeline_stage)} · {titleCase(lead.lead_temperature)}
            {lead.site_region || lead.site_location ? ` · ${lead.site_region ?? lead.site_location}` : ''}
          </Text>
        </View>
        {lead.ai_score != null ? (
          <View className="rounded-lg bg-slate-100 px-2 py-1">
            <Text className="text-xs font-bold text-slate-600">AI {lead.ai_score}</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-2 flex-row items-center gap-1.5">
        <View className={`rounded-md px-1.5 py-0.5 ${reasonBg}`}>
          <Text className={`text-xs font-semibold ${reasonText}`}>{reason}</Text>
        </View>
        {lead.follow_up_date ? (
          <Text className="text-xs text-slate-400">
            📅 {new Date(lead.follow_up_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        ) : null}
      </View>

      {lead.next_action ? (
        <Text className="mt-2 text-sm leading-5 text-slate-700" numberOfLines={2}>
          Next: {lead.next_action}
        </Text>
      ) : null}
      <Text className="mt-1 text-xs leading-5 text-slate-500" numberOfLines={2}>
        Why: {insight}
      </Text>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={() => Linking.openURL(`tel:${lead.contact}`)}
          className="flex-1 items-center rounded-lg bg-green-50 py-2 active:bg-green-100"
        >
          <Text className="text-sm font-semibold text-green-700">Call</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(`https://wa.me/${lead.contact.replace(/[^0-9]/g, '')}`)}
          className="flex-1 items-center rounded-lg bg-emerald-50 py-2 active:bg-emerald-100"
        >
          <Text className="text-sm font-semibold text-emerald-700">WhatsApp</Text>
        </Pressable>
        <Pressable onPress={onOpen} className="flex-1 items-center rounded-lg bg-slate-100 py-2 active:bg-slate-200">
          <Text className="text-sm font-semibold text-ink">Open</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/**
 * "Here's what YOU do today" — My Work, first thing on app open.
 * For drivers/supervisors this strip IS the reason to open the app.
 */
function MyWorkStrip() {
  const router = useRouter();
  const { data } = useMyWork();
  const q = data?.data;
  if (!q) return null;
  const urgent = q.attention.length;
  const today = q.today.length;
  if (!urgent && !today) return null;
  const preview = [...q.attention, ...q.today].slice(0, 3);

  return (
    <Pressable
      onPress={() => router.push('/onehub/my-work' as never)}
      className={`mb-3 rounded-2xl p-4 active:opacity-80 ${urgent ? 'bg-red-600' : 'bg-ink'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold text-white">✅ My Work — {urgent + today} for today</Text>
        {urgent ? (
          <View className="rounded-full bg-white px-2 py-0.5">
            <Text className="text-xs font-bold text-red-600">{urgent} overdue</Text>
          </View>
        ) : null}
      </View>
      {preview.map((w) => (
        <Text key={w.id} className="mt-1 text-sm text-slate-200" numberOfLines={1}>
          • {w.title}
        </Text>
      ))}
      <Text className="mt-1.5 text-xs font-semibold text-slate-300">Tap to open your work queue →</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const profile = useMyProfile(session?.user?.id);
  const role = (profile.data?.data.role as string | undefined) ?? '';
  const opsRole = OPS_HOME_ROLES.includes(role);
  const opsFirst = role === 'production_supervisor' || role === 'accountant';
  const taskFirst = role === 'engineer' || role === 'sales';
  const opsQuery = useOpsSnapshot(opsRole);
  const [focus, setFocus] = useState<SalesFocus>('all');
  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboardStats();
  const leadsQuery = useLeads({ limit: 100 });
  const revenueQuery = useDashboardRevenue();
  const stats = data?.data;
  const revenue = revenueQuery.data?.data?.revenue;
  const leads = leadsQuery.data?.data ?? [];

  const metrics = useMemo(
    () =>
      computeSalesMetrics(leads, {
        total: stats?.totalLeads,
        hot: stats?.hotLeads,
        dueToday: stats?.dueToday,
        won: stats?.converted,
        cold: stats?.cold,
        lost: stats?.lost,
      }),
    [leads, stats],
  );

  const actions = useMemo(() => computeSalesActions(leads), [leads]);
  const visibleActions = focus === 'all' ? actions : actions.filter((a) => a.category === focus);

  if (taskFirst) {
    return <TaskFirstHome />;
  }

  if (opsFirst) {
    const ops = opsQuery.data?.data;
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
        <ScrollView
          contentContainerClassName="p-4 pb-8"
          refreshControl={
            <RefreshControl refreshing={opsQuery.isRefetching} onRefresh={() => void opsQuery.refetch()} />
          }
        >
          <MyWorkStrip />
          {opsQuery.isLoading ? (
            <SkeletonList count={5} />
          ) : !ops ? (
            <View className="items-center rounded-xl border border-slate-200 bg-white p-4">
              <Text className="text-center text-sm text-red-500">
                Couldn't load the ops snapshot — pull down to retry
              </Text>
            </View>
          ) : (
            <OpsHomePanel data={ops} />
          )}

          <Text className="mb-2 mt-2 text-base font-bold text-ink">🚀 Go to</Text>
          <View className="flex-row flex-wrap justify-between">
            {[
              ...(role === 'production_supervisor'
                ? [
                    { label: '🏭 Production', path: '/(tabs)/production' },
                    { label: '🚚 Deliveries', path: '/(tabs)/deliveries' },
                  ]
                : [{ label: '📈 Leads', path: '/(tabs)/leads' }]),
              { label: '👀 Approvals', path: '/onehub/approvals' },
              { label: '💰 Expenses', path: '/onehub/expenses' },
            ].map((l) => (
              <Pressable
                key={l.path}
                onPress={() => router.push(l.path as never)}
                className="mb-3 w-[48.5%] items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-ink">{l.label}</Text>
              </Pressable>
            ))}
          </View>

          {ops?.as_of ? (
            <Text className="mt-1 text-center text-xs text-slate-400">
              As of {new Date(ops.as_of).toLocaleTimeString('en-IN')} · pull down to refresh
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <SkeletonList count={6} />
      </View>
    );
  }

  if (isError || !stats) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-center text-red-500">
          {error instanceof Error ? error.message : 'Failed to load dashboard'}
        </Text>
        <Pressable onPress={() => refetch()} className="mt-4 rounded-xl bg-brand px-5 py-2.5">
          <Text className="font-semibold text-ink">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || leadsQuery.isRefetching || revenueQuery.isRefetching}
            onRefresh={() => {
              void refetch();
              void leadsQuery.refetch();
              void revenueQuery.refetch();
            }}
          />
        }
      >
        <MyWorkStrip />

        {leadsQuery.isLoading ? (
          <View className="mb-3 items-center rounded-xl border border-slate-200 bg-white p-4">
            <ActivityIndicator color="#f97316" />
            <Text className="mt-2 text-xs text-slate-400">Loading sales cockpit…</Text>
          </View>
        ) : (
          <>
            <SalesPulseCard metrics={metrics} pipelineValue={revenue?.pipelineValue} />
            <FunnelSnapshot leads={leads} />
            <SalesCoach metrics={metrics} />
          </>
        )}

        {opsRole && opsQuery.data?.data ? <OpsHomePanel data={opsQuery.data.data} compact /> : null}

        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">⚡ Revenue Actions</Text>
          {actions.length > 0 ? (
            <View className="rounded-full bg-brand px-2 py-0.5">
              <Text className="text-xs font-bold text-ink">{visibleActions.length}/{actions.length}</Text>
            </View>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 max-h-12">
          <FocusPill label="All" active={focus === 'all'} onPress={() => setFocus('all')} />
          <FocusPill label="🔥 Close now" active={focus === 'close_now'} onPress={() => setFocus('close_now')} />
          <FocusPill label="🧱 Build trust" active={focus === 'trust'} onPress={() => setFocus('trust')} />
          <FocusPill label="💰 Quote" active={focus === 'quote'} onPress={() => setFocus('quote')} />
          <FocusPill label="🧹 Cleanup" active={focus === 'cleanup'} onPress={() => setFocus('cleanup')} />
        </ScrollView>

        {leadsQuery.isLoading ? null : visibleActions.length === 0 ? (
          <View className="mb-3 items-center rounded-xl border border-slate-200 bg-white p-4">
            <Text className="text-sm text-slate-400">✅ No actions in this focus. Check another filter.</Text>
          </View>
        ) : (
          <View className="mb-3">
            {visibleActions.map((a) => (
              <ActionRow key={`${a.category}-${a.lead.id}`} action={a} onOpen={() => router.push(`/leads/${a.lead.id}`)} />
            ))}
          </View>
        )}

        {revenue ? (
          <View className="mb-3 mt-2 rounded-xl border border-slate-200 bg-white p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">💰 This month</Text>
            <View className="mt-2 flex-row">
              <View className="flex-1">
                <Text className="text-2xl font-bold text-ink">{formatINR(revenue.revenueWon)}</Text>
                <Text className="text-xs text-slate-400">Revenue won</Text>
              </View>
              <View className="flex-1">
                <Text className="text-2xl font-bold text-brand">{formatINR(revenue.pipelineValue)}</Text>
                <Text className="text-xs text-slate-400">Pipeline value</Text>
              </View>
            </View>
            <View className="mt-3 flex-row">
              <Text className="flex-1 text-xs text-slate-500">Avg order {formatINR(revenue.avgOrderValue)}</Text>
              <Text className="text-xs text-slate-500">Lead→Order {Math.round(revenue.leadToOrderRate)}%</Text>
            </View>
          </View>
        ) : null}

        <View className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <Text className="text-sm font-bold text-ink">Data hygiene</Text>
          <Text className="mt-1 text-xs leading-5 text-slate-500">
            Keep every lead with source, stage, next action, follow-up date, and won/lost reason. Without this, funnel counts are directional only.
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/leads', params: { view: 'hot' } })}
            className="flex-1 items-center rounded-xl bg-red-50 py-3 active:opacity-70"
          >
            <Text className="text-sm font-bold text-red-700">Hot leads</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/leads', params: { view: 'follow_ups' } })}
            className="flex-1 items-center rounded-xl bg-amber-50 py-3 active:opacity-70"
          >
            <Text className="text-sm font-bold text-amber-700">Follow-ups</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/leads', params: { view: 'attention' } })}
            className="flex-1 items-center rounded-xl bg-slate-100 py-3 active:opacity-70"
          >
            <Text className="text-sm font-bold text-slate-700">Stale</Text>
          </Pressable>
        </View>

        <Text className="mt-4 text-center text-xs text-slate-400">Pull down to refresh · tap any action to open full lead timeline</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
