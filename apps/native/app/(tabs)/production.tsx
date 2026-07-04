import type { ProductionOrder, ProductionOrderStatus } from '@maiyuri/shared';
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
import { useProductionOrders } from '@/hooks/use-production';

const STATUS_STYLE: Record<ProductionOrderStatus, { bg: string; label: string }> = {
  draft: { bg: 'bg-slate-400', label: 'Draft' },
  pending_approval: { bg: 'bg-violet-500', label: 'Pending Approval' },
  approved: { bg: 'bg-sky-500', label: 'Approved' },
  confirmed: { bg: 'bg-sky-600', label: 'Confirmed' },
  in_progress: { bg: 'bg-amber-500', label: 'In Progress' },
  done: { bg: 'bg-green-500', label: 'Done' },
  completed: { bg: 'bg-green-600', label: 'Completed' },
  cancelled: { bg: 'bg-red-500', label: 'Cancelled' },
};

function OrderRow({ order }: { order: ProductionOrder }) {
  const s = STATUS_STYLE[order.status] ?? {
    bg: 'bg-slate-400',
    label: order.status,
  };
  const date = order.scheduled_date
    ? new Date(order.scheduled_date).toLocaleDateString()
    : '—';
  const qty =
    order.actual_quantity !== null
      ? `${order.actual_quantity} / ${order.planned_quantity}`
      : `${order.planned_quantity} planned`;

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
          {order.order_number}
        </Text>
        <View className={`ml-2 rounded-full px-2 py-0.5 ${s.bg}`}>
          <Text className="text-xs font-medium text-white">{s.label}</Text>
        </View>
      </View>

      <Text className="mt-1 text-sm text-slate-600" numberOfLines={1}>
        {order.finished_good?.name ?? 'Product'} · {qty}
      </Text>

      <Text className="mt-1 text-xs text-slate-400">
        Scheduled {date}
        {order.odoo_sync_status ? ` · Odoo: ${order.odoo_sync_status}` : ''}
      </Text>
    </View>
  );
}

export default function ProductionScreen() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useProductionOrders({ search: search || undefined });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <View className="px-4 pb-2 pt-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search production orders…"
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
            {error instanceof Error ? error.message : 'Failed to load orders'}
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
          renderItem={({ item }) => <OrderRow order={item} />}
          contentContainerClassName="px-4 pb-6"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-slate-400">
              No production orders found
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
