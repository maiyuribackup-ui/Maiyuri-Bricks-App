import type { Lead } from '@maiyuri/shared';
import type { WorkItem } from '@maiyuri/shared';
import { useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCompleteWork, useMyWork, useStartWork } from '@/hooks/use-my-work';
import { useLeads } from '@/hooks/use-leads';
import { SkeletonList } from '@/ui';

/**
 * 🎯 Task-first home — for staff who should see WORK, not dashboards.
 * Giant cards, Tamil + English, one thumb-tap to start/finish. Built for the
 * least tech-savvy person on the team: if he can use WhatsApp, he can use this.
 */

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/** A task can be finished in one tap only when nothing else is mandatory. */
const isOneTap = (w: WorkItem) =>
  !w.checklist_instance_id && !w.requires_photo && !w.requires_note;

function BigButton({
  label,
  onPress,
  tone,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone: 'start' | 'done' | 'open';
  disabled?: boolean;
}) {
  const bg =
    tone === 'done'
      ? 'bg-green-600'
      : tone === 'start'
        ? 'bg-brand'
        : 'bg-ink';
  const text = tone === 'start' ? 'text-ink' : 'text-white';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`mt-3 items-center rounded-2xl px-4 py-4 ${bg} ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
    >
      <Text className={`text-lg font-bold ${text}`}>{label}</Text>
    </Pressable>
  );
}

function TaskCard({ item, overdue }: { item: WorkItem; overdue: boolean }) {
  const router = useRouter();
  const start = useStartWork(item.id);
  const complete = useCompleteWork(item.id);
  const busy = start.isPending || complete.isPending;
  const openDetail = () => router.push(`/onehub/my-work/${item.id}` as never);

  const finish = () => {
    complete.mutate(
      {},
      {
        onError: (e) => {
          // Missing photo/note etc. — send him into the task screen where the
          // camera/note lives instead of showing a wall of text.
          Alert.alert(
            'இன்னும் கொஞ்சம் · Almost there',
            e instanceof Error ? e.message : 'Open the task to finish it',
            [{ text: 'Open · திற', onPress: openDetail }],
          );
        },
      },
    );
  };

  return (
    <Pressable
      onPress={openDetail}
      className={`mb-3 rounded-2xl border-2 bg-white p-4 ${overdue ? 'border-red-400' : 'border-slate-200'}`}
    >
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-2 text-xl font-bold leading-7 text-ink">
          {item.title}
        </Text>
        {overdue ? (
          <View className="rounded-full bg-red-100 px-2.5 py-1">
            <Text className="text-xs font-bold text-red-600">தாமதம்!</Text>
          </View>
        ) : item.due_at ? (
          <View className="rounded-full bg-amber-100 px-2.5 py-1">
            <Text className="text-xs font-bold text-amber-700">
              ⏰ {fmtTime(item.due_at)}
            </Text>
          </View>
        ) : null}
      </View>
      {item.related_label ? (
        <Text className="mt-1 text-sm text-slate-500" numberOfLines={1}>
          📍 {item.related_label}
        </Text>
      ) : null}
      {item.description ? (
        <Text className="mt-1 text-base text-slate-600" numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      {item.status === 'pending' || item.status === 'returned' ? (
        <BigButton
          tone="start"
          label="▶️  வேலையை தொடங்கு · Start"
          onPress={() => start.mutate()}
          disabled={busy}
        />
      ) : isOneTap(item) ? (
        <BigButton
          tone="done"
          label="✅  முடிந்தது · Done"
          onPress={finish}
          disabled={busy}
        />
      ) : (
        <BigButton
          tone="open"
          label={`📷  பணியை திற · Open task${item.requires_photo ? ' (photo)' : ''}`}
          onPress={openDetail}
          disabled={busy}
        />
      )}
    </Pressable>
  );
}

function FollowUpRow({ lead }: { lead: Lead }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/leads/${lead.id}` as never)}
      className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:opacity-70"
    >
      <View className="min-w-0 flex-1 pr-2">
        <Text className="text-base font-bold text-ink" numberOfLines={1}>
          {lead.name}
        </Text>
        {lead.next_action ? (
          <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
            → {lead.next_action}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => Linking.openURL(`tel:${lead.contact}`)}
        className="h-14 w-14 items-center justify-center rounded-full bg-green-600 active:opacity-80"
      >
        <Text className="text-xl">📞</Text>
      </Pressable>
    </Pressable>
  );
}

const OPEN_EXCLUDED = new Set(['order_won', 'closed_lost']);

export function TaskFirstHome() {
  const work = useMyWork();
  const leadsQuery = useLeads({ limit: 100 });
  const q = work.data?.data;

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const dueLeads = (leadsQuery.data?.data ?? [])
    .filter(
      (l) =>
        !OPEN_EXCLUDED.has(l.pipeline_stage) &&
        l.follow_up_date &&
        new Date(l.follow_up_date) <= endOfToday,
    )
    .slice(0, 6);

  const tasks = q ? [...q.attention, ...q.today] : [];
  const doneToday = q?.completed_today.length ?? 0;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerClassName="p-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={work.isRefetching || leadsQuery.isRefetching}
            onRefresh={() => {
              void work.refetch();
              void leadsQuery.refetch();
            }}
          />
        }
      >
        {/* Big, warm, unmissable header */}
        <View className="mb-4 rounded-3xl bg-ink p-5">
          <Text className="text-2xl font-bold text-white">
            🙏 வணக்கம்!
          </Text>
          <Text className="mt-1 text-base text-slate-300">
            {tasks.length > 0
              ? `இன்று உங்கள் வேலை: ${tasks.length} · Today's tasks: ${tasks.length}`
              : 'இன்று வேலை இல்லை · No tasks today'}
          </Text>
          {doneToday > 0 ? (
            <Text className="mt-1 text-sm font-semibold text-green-400">
              இன்று முடித்தது {doneToday} ✅ · {doneToday} finished today
            </Text>
          ) : null}
        </View>

        {work.isLoading ? (
          <SkeletonList count={4} />
        ) : tasks.length === 0 ? (
          <View className="mb-3 items-center rounded-2xl border border-slate-200 bg-white p-6">
            <Text className="text-4xl">🎉</Text>
            <Text className="mt-2 text-lg font-bold text-ink">
              எல்லாம் முடிந்தது! · All done!
            </Text>
          </View>
        ) : (
          tasks.map((w) => (
            <TaskCard
              key={w.id}
              item={w}
              overdue={q?.attention.some((a) => a.id === w.id) ?? false}
            />
          ))
        )}

        {/* Follow-up calls due — his sales side, same one-tap treatment */}
        {dueLeads.length > 0 ? (
          <>
            <Text className="mb-2 mt-2 text-lg font-bold text-ink">
              📞 இன்று அழைக்க வேண்டியவை · Calls due today
            </Text>
            {dueLeads.map((l) => (
              <FollowUpRow key={l.id} lead={l} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
