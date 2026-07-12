import type { DeliveryStatus, DeliveryWithLines } from '@maiyuri/shared';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCompleteDelivery, useDeliveries } from '@/hooks/use-deliveries';
import { useIsOnline } from '@/lib/offline';
import { toast } from '@/lib/toast';

const STATUS_STYLE: Record<DeliveryStatus, { bg: string; label: string }> = {
  draft: { bg: 'bg-slate-400', label: 'Draft' },
  waiting: { bg: 'bg-slate-500', label: 'Waiting' },
  confirmed: { bg: 'bg-sky-500', label: 'Confirmed' },
  assigned: { bg: 'bg-violet-500', label: 'Assigned' },
  in_transit: { bg: 'bg-amber-500', label: 'In Transit' },
  delivered: { bg: 'bg-green-500', label: 'Delivered' },
  cancelled: { bg: 'bg-red-500', label: 'Cancelled' },
};

type TabKey = 'today' | 'upcoming' | 'completed' | 'all';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const OPEN = (d: DeliveryWithLines) =>
  d.status !== 'delivered' && d.status !== 'cancelled';

/**
 * Today's route order: cluster stops by area (city) so the driver finishes one
 * neighbourhood before moving on, then keep a stable name order inside each
 * area. No GPS optimisation — just "don't zig-zag across town".
 */
function routeOrder(a: DeliveryWithLines, b: DeliveryWithLines): number {
  const cityA = (a.customer_city ?? '￿').toLowerCase(); // nulls last
  const cityB = (b.customer_city ?? '￿').toLowerCase();
  if (cityA !== cityB) return cityA < cityB ? -1 : 1;
  return (a.customer_name ?? '').localeCompare(b.customer_name ?? '');
}

function applyTab(list: DeliveryWithLines[], tab: TabKey): DeliveryWithLines[] {
  const todayStr = new Date().toDateString();
  switch (tab) {
    case 'today':
      return list
        .filter(
          (d) => OPEN(d) && new Date(d.scheduled_date).toDateString() === todayStr,
        )
        .sort(routeOrder);
    case 'upcoming':
      return list.filter(
        (d) =>
          OPEN(d) &&
          new Date(d.scheduled_date) > new Date(new Date().setHours(23, 59, 59, 999)),
      );
    case 'completed':
      return list.filter((d) => d.status === 'delivered');
    default:
      return list;
  }
}

/** Google Maps: prefer coordinates, fall back to the address text. */
function openNavigation(d: DeliveryWithLines) {
  const url =
    d.delivery_latitude != null && d.delivery_longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${d.delivery_latitude},${d.delivery_longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          [d.customer_address, d.customer_city].filter(Boolean).join(', '),
        )}`;
  void Linking.openURL(url);
}

// ---------- Mark Delivered modal ----------

function MarkDeliveredModal({
  delivery,
  onClose,
}: {
  delivery: DeliveryWithLines | null;
  onClose: () => void;
}) {
  const complete = useCompleteDelivery();
  const online = useIsOnline();
  const [photos, setPhotos] = useState<string[]>([]); // data URLs
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [tripKm, setTripKm] = useState('');
  const [diesel, setDiesel] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  if (delivery && delivery.id !== openedFor) {
    setOpenedFor(delivery.id);
    setPhotos([]);
    setRecipient('');
    setNotes('');
    setTripKm('');
    setDiesel('');
    complete.reset();
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.35, // keep the request body small — API accepts data URLs
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.base64) {
      setPhotos((p) => [...p, `data:image/jpeg;base64,${asset.base64}`]);
    }
  };

  const submit = () => {
    if (!delivery) return;
    complete.mutate(
      {
        id: delivery.id,
        photoUrls: photos.length ? photos : undefined,
        recipientName: recipient.trim() || undefined,
        notes: notes.trim() || undefined,
        tripKm: Number(tripKm) > 0 ? Number(tripKm) : undefined,
        dieselCost: Number(diesel) > 0 ? Number(diesel) : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Delivery marked as delivered');
          onClose();
        },
      },
    );
    // Offline: the mutation is now QUEUED (paused), not failed — it fires on
    // reconnect and even survives an app restart. Tell the driver and move on.
    if (!online) {
      toast.info('Saved offline — will sync when back on network');
      onClose();
    }
  };

  return (
    <Modal visible={!!delivery} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[85%] rounded-t-3xl bg-white">
          <View className="border-b border-slate-100 px-5 py-4">
            <Text className="text-lg font-bold text-ink">✅ Mark Delivered</Text>
            <Text className="text-sm text-slate-500" numberOfLines={1}>
              {delivery?.name} · {delivery?.customer_name}
            </Text>
          </View>

          <ScrollView className="px-5 py-4" contentContainerClassName="pb-6">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Proof photo(s)
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              {photos.map((p, i) => (
                <Pressable
                  key={i}
                  onLongPress={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                >
                  <Image
                    source={{ uri: p }}
                    style={{ width: 72, height: 72, borderRadius: 10 }}
                  />
                </Pressable>
              ))}
              <Pressable
                onPress={takePhoto}
                className="h-[72px] w-[72px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 active:opacity-70"
              >
                <Text className="text-2xl">📷</Text>
              </Pressable>
            </View>
            <Text className="mt-1 text-xs text-slate-400">
              Long-press a photo to remove it
            </Text>

            <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Received by
            </Text>
            <TextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder="Recipient name"
              placeholderTextColor="#94a3b8"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-ink"
            />

            <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Trip — km & diesel (₹)
            </Text>
            <View className="flex-row gap-2">
              <TextInput
                value={tripKm}
                onChangeText={setTripKm}
                keyboardType="numeric"
                placeholder="km driven"
                placeholderTextColor="#94a3b8"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-ink"
              />
              <TextInput
                value={diesel}
                onChangeText={setDiesel}
                keyboardType="numeric"
                placeholder="diesel ₹"
                placeholderTextColor="#94a3b8"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-ink"
              />
            </View>

            <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Notes
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Unloaded at rear gate"
              placeholderTextColor="#94a3b8"
              multiline
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-ink"
            />

            {complete.isError ? (
              <Text className="mt-3 text-sm text-red-500">
                {complete.error instanceof Error
                  ? complete.error.message
                  : 'Failed to complete delivery'}
              </Text>
            ) : null}
          </ScrollView>

          <View className="flex-row gap-2 border-t border-slate-100 p-4">
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-xl border border-slate-200 py-3 active:opacity-70"
            >
              <Text className="font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={complete.isPending}
              className={`flex-1 items-center rounded-xl py-3 ${
                complete.isPending ? 'bg-slate-200' : 'bg-green-500 active:opacity-80'
              }`}
            >
              {complete.isPending ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text className="font-semibold text-white">Confirm delivered</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- rows ----------

function DeliveryRow({
  delivery,
  onMarkDelivered,
  stop,
}: {
  delivery: DeliveryWithLines;
  onMarkDelivered: (d: DeliveryWithLines) => void;
  /** 1-based stop number + total, shown only on the Today route. */
  stop?: { n: number; of: number };
}) {
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
        {stop ? (
          <View className="mr-2 h-6 min-w-[24px] items-center justify-center rounded-full bg-ink px-1.5">
            <Text className="text-xs font-bold text-white">{stop.n}</Text>
          </View>
        ) : null}
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
      <Text className="mt-0.5 text-xs text-slate-400">
        Scheduled {date}
        {delivery.total_quantity ? ` · qty ${delivery.total_quantity}` : ''}
        {delivery.recipient_name ? ` · signed: ${delivery.recipient_name}` : ''}
      </Text>

      <View className="mt-2.5 flex-row items-center gap-2 border-t border-slate-100 pt-2.5">
        {delivery.customer_phone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${delivery.customer_phone}`)}
            className="rounded-lg bg-green-50 px-3 py-1.5 active:opacity-70"
          >
            <Text className="text-xs font-semibold text-green-700">📞 Call</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => openNavigation(delivery)}
          className="rounded-lg bg-sky-50 px-3 py-1.5 active:opacity-70"
        >
          <Text className="text-xs font-semibold text-sky-700">🗺️ Navigate</Text>
        </Pressable>
        <View className="flex-1" />
        {OPEN(delivery) ? (
          <Pressable
            onPress={() => onMarkDelivered(delivery)}
            className="rounded-lg bg-green-500 px-3 py-1.5 active:opacity-80"
          >
            <Text className="text-xs font-semibold text-white">✅ Mark Delivered</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ---------- screen ----------

export default function DeliveriesScreen() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('today');
  const [completing, setCompleting] = useState<DeliveryWithLines | null>(null);
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useDeliveries({ search: search || undefined });

  const list = useMemo(
    () => applyTab(data?.data ?? [], tab),
    [data, tab],
  );

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <View className="px-4 pb-1 pt-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search deliveries…"
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
        />
      </View>

      <View className="flex-row gap-2 px-4 py-2">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 ${
              tab === t.key ? 'bg-ink' : 'border border-slate-200 bg-white'
            }`}
          >
            <Text
              className={`text-xs font-medium ${tab === t.key ? 'text-white' : 'text-slate-600'}`}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
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
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <DeliveryRow
              delivery={item}
              onMarkDelivered={setCompleting}
              stop={tab === 'today' ? { n: index + 1, of: list.length } : undefined}
            />
          )}
          ListHeaderComponent={
            tab === 'today' && list.length > 1 ? (
              <Text className="mb-2 text-xs font-medium text-slate-500">
                🚚 Route: {list.length} stops, grouped by area
              </Text>
            ) : null
          }
          contentContainerClassName="px-4 pb-6"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-slate-400">
              {tab === 'today'
                ? 'No deliveries scheduled today'
                : 'No deliveries in this view'}
            </Text>
          }
        />
      )}

      <MarkDeliveredModal delivery={completing} onClose={() => setCompleting(null)} />
    </SafeAreaView>
  );
}
