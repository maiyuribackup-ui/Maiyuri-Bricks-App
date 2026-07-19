import type { ProductionOrder, ProductionOrderStatus } from '@maiyuri/shared';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useProductionOrders,
  useSubmitForApproval,
  useUpdateProductionOrder,
} from '@/hooks/use-production';
import { toast } from '@/lib/toast';

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

// Sensible one-tap transitions from the factory floor.
const STATUS_ACTIONS: { value: ProductionOrderStatus; label: string }[] = [
  { value: 'in_progress', label: '▶️ Start (In Progress)' },
  { value: 'done', label: '✅ Done' },
  { value: 'completed', label: '🏁 Completed' },
  { value: 'cancelled', label: '❌ Cancelled' },
];

function OrderActionsModal({
  order,
  onClose,
}: {
  order: ProductionOrder | null;
  onClose: () => void;
}) {
  const update = useUpdateProductionOrder();
  const approval = useSubmitForApproval();
  const [qty, setQty] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, unknown>>({});

  if (order && order.id !== openedFor) {
    setOpenedFor(order.id);
    setQty(order.actual_quantity != null ? String(order.actual_quantity) : '');
    setApplied({});
    update.reset();
    approval.reset();
  }

  const currentStatus = (applied.status as string) ?? order?.status;
  const busy = update.isPending || approval.isPending;

  const setStatus = (status: ProductionOrderStatus) => {
    if (!order) return;
    update.mutate(
      { id: order.id, body: { status } },
      {
        onSuccess: () => {
          setApplied((a) => ({ ...a, status }));
          toast.success('Status updated');
        },
      },
    );
  };

  const saveQty = () => {
    if (!order) return;
    const value = Number(qty.replace(/[,\s]/g, ''));
    if (Number.isNaN(value) || value < 0) {
      toast.error('Enter a valid produced quantity (number ≥ 0)');
      return;
    }
    update.mutate(
      { id: order.id, body: { actual_quantity: value } },
      {
        onSuccess: () => {
          setApplied((a) => ({ ...a, actual_quantity: value }));
          toast.success('Quantity saved');
        },
      },
    );
  };

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[80%] rounded-t-3xl bg-white">
          <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                🏭 {order?.order_number}
              </Text>
              <Text className="text-sm text-slate-500" numberOfLines={1}>
                {order?.finished_good?.name ?? 'Production order'} · currently{' '}
                {String(currentStatus ?? '').replaceAll('_', ' ')}
              </Text>
            </View>
            {busy ? <ActivityIndicator color="#f97316" /> : null}
          </View>

          <ScrollView className="px-5" contentContainerClassName="pb-6">
            {(update.isError || approval.isError) ? (
              <Text className="mt-3 text-sm text-red-500">
                {(update.error ?? approval.error) instanceof Error
                  ? ((update.error ?? approval.error) as Error).message
                  : 'Update failed'}
              </Text>
            ) : null}

            <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Update status
            </Text>
            <View className="flex-row flex-wrap">
              {STATUS_ACTIONS.map((s) => (
                <Pressable
                  key={s.value}
                  onPress={() => setStatus(s.value)}
                  disabled={busy}
                  className={`mb-1.5 mr-1.5 rounded-lg border px-3 py-2 ${
                    currentStatus === s.value
                      ? 'border-ink bg-ink'
                      : 'border-slate-200 bg-white'
                  } ${busy ? 'opacity-50' : 'active:opacity-70'}`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      currentStatus === s.value ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Actual quantity produced
            </Text>
            <View className="flex-row gap-2">
              <TextInput
                value={qty}
                onChangeText={setQty}
                keyboardType="numeric"
                placeholder={`Planned: ${order?.planned_quantity ?? '—'}`}
                placeholderTextColor="#94a3b8"
                className="flex-1 rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
              />
              <Pressable
                onPress={saveQty}
                disabled={busy || !qty.trim()}
                className={`items-center justify-center rounded-xl px-5 ${
                  busy || !qty.trim() ? 'bg-slate-200' : 'bg-brand active:opacity-80'
                }`}
              >
                <Text className="text-sm font-semibold text-ink">Save</Text>
              </Pressable>
            </View>

            {currentStatus === 'draft' ? (
              <Pressable
                onPress={() =>
                  order &&
                  approval.mutate(
                    { id: order.id },
                    {
                      onSuccess: () => {
                        setApplied((a) => ({ ...a, status: 'pending_approval' }));
                        toast.success('Sent for approval');
                      },
                    },
                  )
                }
                disabled={busy}
                className={`mt-5 items-center rounded-xl py-3 ${
                  busy ? 'bg-slate-200' : 'bg-violet-500 active:opacity-80'
                }`}
              >
                <Text className="font-semibold text-white">
                  📨 Submit for approval
                </Text>
              </Pressable>
            ) : null}
            {approval.isSuccess ? (
              <Text className="mt-2 text-xs text-emerald-600">
                ✅ Sent — leadership has been notified.
              </Text>
            ) : null}
          </ScrollView>

          <View className="border-t border-slate-100 p-4">
            <Pressable
              onPress={onClose}
              className="items-center rounded-xl bg-ink py-3 active:opacity-80"
            >
              <Text className="font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OrderRow({
  order,
  onPress,
}: {
  order: ProductionOrder;
  onPress: (o: ProductionOrder) => void;
}) {
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
    <Pressable
      onPress={() => onPress(order)}
      className="mb-2 rounded-xl border border-slate-200 bg-white p-4 active:opacity-70"
    >
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
        {'  ·  tap for actions'}
      </Text>
    </Pressable>
  );
}

export default function ProductionScreen() {
  const [search, setSearch] = useState('');
  const [actionOrder, setActionOrder] = useState<ProductionOrder | null>(null);
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useProductionOrders({ search: search || undefined });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
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
          renderItem={({ item }) => (
            <OrderRow order={item} onPress={setActionOrder} />
          )}
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

      <OrderActionsModal order={actionOrder} onClose={() => setActionOrder(null)} />
    </SafeAreaView>
  );
}
