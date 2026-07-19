import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { SkeletonList } from '@/ui';

/**
 * 🧠 Pre-call brief (Golden Hour GH2) — everything the rep needs to sound
 * fully prepared, generated seconds before the call: who/what, rate-card
 * pricing for their distance, the likely objection + answer, and an opening
 * line in Tamil.
 */

type Brief = {
  lead_id: string;
  lead_name: string | null;
  who: string;
  situation: string;
  distance_note: string;
  price_guidance: string[];
  likely_objection: string;
  objection_answer: string;
  opening_line_ta: string;
  opening_line_en: string;
  generated_at: string;
};

function Block({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <View className={`mb-3 rounded-xl border p-4 ${tone ?? 'border-slate-200 bg-white'}`}>
      <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function PreCallBriefScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const query = useQuery({
    queryKey: ['lead-brief', leadId],
    queryFn: () =>
      api.get<Brief>(`/api/leads/${leadId}/brief`, undefined, { timeoutMs: 55_000 }),
    enabled: !!leadId,
    staleTime: 10 * 60 * 1000,
  });
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
        <>
          <Text className="mb-3 text-center text-sm text-slate-400">
            🧠 Preparing your brief…
          </Text>
          <SkeletonList count={5} />
        </>
      ) : !b ? (
        <View className="items-center rounded-xl border border-slate-200 bg-white p-6">
          <Text className="text-center text-sm text-red-500">
            {query.error instanceof Error ? query.error.message : "Couldn't build the brief"}
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
          <Text className="mb-3 text-xl font-bold text-ink">
            🧠 {b.lead_name ?? 'Lead'} — pre-call brief
          </Text>

          <Block title="Who">
            <Text className="text-base leading-6 text-ink">{b.who}</Text>
          </Block>

          <Block title="Where things stand">
            <Text className="text-sm leading-6 text-slate-700">{b.situation}</Text>
            {b.distance_note ? (
              <Text className="mt-2 text-xs text-slate-500">📍 {b.distance_note}</Text>
            ) : null}
          </Block>

          <Block title="💰 What to quote" tone="border-green-200 bg-green-50">
            {b.price_guidance.map((line) => (
              <Text key={line} className="mb-1 text-sm font-semibold leading-6 text-green-900">
                {line}
              </Text>
            ))}
          </Block>

          <Block title="⚔️ Likely objection" tone="border-amber-200 bg-amber-50">
            <Text className="text-sm font-semibold text-amber-900">
              “{b.likely_objection}”
            </Text>
            <Text className="mt-1 text-sm leading-6 text-amber-800">
              → {b.objection_answer}
            </Text>
          </Block>

          <Block title="🎤 Opening line" tone="border-slate-700 bg-ink">
            <Text className="text-base font-semibold leading-7 text-white">
              {b.opening_line_ta}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-400">
              {b.opening_line_en}
            </Text>
          </Block>

          <Text className="mt-1 text-center text-xs text-slate-400">
            Prices from the rate card · distance is an estimate — confirm on the call
          </Text>
        </>
      )}
    </ScrollView>
  );
}
