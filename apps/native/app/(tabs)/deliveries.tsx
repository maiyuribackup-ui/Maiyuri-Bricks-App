import type { DeliveryStatus, DeliveryWithLines } from '@maiyuri/shared';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDeliveries } from '@/hooks/use-deliveries';

const STATUS_STYLE: Record<DeliveryStatus, { bg: string; label: string }> = {
  draft: { bg: 'bg-slate-400', label: 'Draft' },
  waiting: { bg: 'bg-slate-500', label: 'Waiting' },
  confirmed: { bg: 'bg-sky-500', label: 'Confirmed' },
  assigned: { bg: 'bg-violet-500', label: 'Assigned' },
  in_transit: { bg: 'bg-amber-500', label: 'In Transit' },
  delivered: { bg: 'bg-green-500', label: 'Delivered' },
  cancelled: { bg: 'bg-red-500', label: 'Cancelled' },
};

function DeliveryRow({ delivery }: { delivery: DeliveryWithLines }) {
  const s = STATUS_STYLE[delivery.status] ?? {
    bg: 'bg-slate-400',
    label: delivery.status,
  };
  const date = delivery.scheduled_date
    ? new Date(delivery.scheduled_date).toLocaleDateString()
    : '—';

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
          {delivery.name}
        </Text>
        <View className={`ml-2 rounded-full px-2 py-0.5 ${s.bg}`}>
          <Text className="text-xs font-medium text-white">{s.label}</Text>
        </View>
      </View>

      <Text className="mt-1 text-sm text-slate-600" numberOfLines={1}>
        {delivery.customer_name}
        {delivery.customer_city ? ` · ${delivery.customer_city}` : ''}
      </Text>

      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-xs text-slate-400">
          Scheduled {date}
          {delivery.total_quantity ? ` · qty ${delivery.total_quantity}` : ''}
        </Text>
        {delivery.customer_phone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${delivery.customer_phone}`)}
            className="rounded-lg bg-brand px-3 py-1 active:opacity-70"
          >
            <Text className="text-xs font-semibold text-ink">Call</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function DeliveriesScreen() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useDeliveries({ search: search || undefined });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <View className="px-4 pb-2 pt-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search deliveries…"
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
            {error instanceof Error ? error.message : 'Failed to load deliveries'}
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
          renderItem={({ item }) => <DeliveryRow delivery={item} />}
          contentContainerClassName="px-4 pb-6"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-slate-400">
              No deliveries found
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
