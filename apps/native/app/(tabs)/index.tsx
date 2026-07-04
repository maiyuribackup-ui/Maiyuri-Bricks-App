import type { Lead, LeadTemperature } from '@maiyuri/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLeads } from '@/hooks/use-leads';

const TEMP_COLOR: Record<LeadTemperature, string> = {
  hot: 'bg-red-500',
  warm: 'bg-amber-500',
  cold: 'bg-sky-500',
};

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <Link href={`/leads/${lead.id}`} asChild>
      <Pressable className="mb-2 rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
            {lead.name}
          </Text>
          <View
            className={`ml-2 rounded-full px-2 py-0.5 ${TEMP_COLOR[lead.lead_temperature] ?? 'bg-slate-400'}`}
          >
            <Text className="text-xs font-medium capitalize text-white">
              {lead.lead_temperature}
            </Text>
          </View>
        </View>
        <Text className="mt-1 text-sm text-slate-500">{lead.contact}</Text>
        <Text className="mt-1 text-xs uppercase tracking-wide text-slate-400">
          {lead.pipeline_stage?.replaceAll('_', ' ')}
        </Text>
      </Pressable>
    </Link>
  );
}

export default function LeadsScreen() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch, isRefetching } = useLeads({
    search: search || undefined,
  });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <View className="px-4 pb-2 pt-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search leads…"
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
        />
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
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LeadRow lead={item} />}
          contentContainerClassName="px-4 pb-6"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-slate-400">No leads found</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
