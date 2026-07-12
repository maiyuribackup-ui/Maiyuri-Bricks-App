import { Link } from 'expo-router';
import type { WorkItem, WorkItemStatus, WorkPriority } from '@maiyuri/shared';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { WORK_ADMIN_ROLES, useMyRole } from '@/hooks/use-approvals';
import { useMyWork } from '@/hooks/use-my-work';

const STATUS_STYLE: Record<WorkItemStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Pending' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In progress' },
  returned: { bg: 'bg-red-100', text: 'text-red-700', label: 'Returned' },
  submitted: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Submitted' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-400', label: 'Cancelled' },
};

const PRIORITY_DOT: Record<WorkPriority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-slate-300',
  low: 'bg-slate-200',
};

function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function WorkCard({ item, overdue }: { item: WorkItem; overdue?: boolean }) {
  const s = STATUS_STYLE[item.status];
  const due = fmtDue(item.due_at);
  const progress = item.checklist_progress;
  return (
    <Link href={`/onehub/my-work/${item.id}` as import('expo-router').Href} asChild>
      <Pressable className="mb-2 rounded-xl border border-slate-200 bg-white p-3.5 active:opacity-70">
        <View className="flex-row items-start">
          <View className={`mt-1.5 mr-2.5 h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[item.priority]}`} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
              {item.title}
            </Text>
            <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
              <View className={`rounded-full px-2 py-0.5 ${s.bg}`}>
                <Text className={`text-[10px] font-semibold ${s.text}`}>{s.label}</Text>
              </View>
              {item.activity_type === 'checklist' && progress ? (
                <Text className="text-[11px] text-slate-400">
                  ☑️ {progress.answered}/{progress.total}
                </Text>
              ) : null}
              {due ? (
                <Text className={`text-[11px] ${overdue ? 'font-semibold text-red-500' : 'text-slate-400'}`}>
                  {overdue ? '⚠️ due ' : 'due '}
                  {due}
                </Text>
              ) : null}
              {item.related_label ? (
                <Text className="text-[11px] text-slate-400" numberOfLines={1}>
                  · {item.related_label}
                </Text>
              ) : null}
            </View>
          </View>
          <Text className="ml-2 text-slate-300">›</Text>
        </View>
      </Pressable>
    </Link>
  );
}

function Section({
  title,
  items,
  overdue,
}: {
  title: string;
  items: WorkItem[];
  overdue?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View className="mb-4">
      <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        {title} ({items.length})
      </Text>
      {items.map((it) => (
        <WorkCard key={it.id} item={it} overdue={overdue} />
      ))}
    </View>
  );
}

export default function MyWorkQueueScreen() {
  const { data, isLoading, isRefetching, refetch } = useMyWork();
  const q = data?.data;
  const role = useMyRole();
  const isAdmin = WORK_ADMIN_ROLES.includes(role);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  const summary = q?.summary;
  const empty =
    !q ||
    (!q.attention.length &&
      !q.today.length &&
      !q.upcoming.length &&
      !q.completed_today.length);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      {/* admin: assign work to someone */}
      {isAdmin ? (
        <Link href={"/onehub/my-work/new" as import('expo-router').Href} asChild>
          <Pressable className="mb-3 flex-row items-center justify-center rounded-xl bg-brand py-2.5 active:opacity-80">
            <Text className="text-sm font-bold text-ink">＋ Assign work to someone</Text>
          </Pressable>
        </Link>
      ) : null}

      {/* summary strip */}
      {summary ? (
        <View className="mb-4 flex-row gap-2">
          {[
            { n: summary.overdue, l: 'Overdue', c: 'text-red-600' },
            { n: summary.due_today, l: 'Today', c: 'text-ink' },
            { n: summary.in_progress, l: 'Doing', c: 'text-blue-600' },
            { n: summary.completed_today, l: 'Done', c: 'text-green-600' },
          ].map((s) => (
            <View key={s.l} className="flex-1 items-center rounded-xl border border-slate-200 bg-white py-2.5">
              <Text className={`text-xl font-bold ${s.c}`}>{s.n}</Text>
              <Text className="text-[10px] uppercase tracking-wider text-slate-400">{s.l}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {empty ? (
        <View className="mt-16 items-center">
          <Text className="text-4xl">🎉</Text>
          <Text className="mt-2 text-base font-semibold text-ink">All clear</Text>
          <Text className="mt-1 text-sm text-slate-400">No work assigned to you right now.</Text>
        </View>
      ) : (
        <>
          <Section title="⚠️ Needs attention" items={q!.attention} overdue />
          <Section title="📌 Today" items={q!.today} />
          <Section title="🗓️ Upcoming" items={q!.upcoming} />
          <Section title="✅ Completed today" items={q!.completed_today} />
        </>
      )}
    </ScrollView>
  );
}
