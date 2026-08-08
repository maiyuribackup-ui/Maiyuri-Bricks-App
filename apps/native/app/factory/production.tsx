import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useFactoryLog,
  useFactoryProducts,
  useSaveProductionLog,
} from '@/hooks/use-factory';
import { DOWNTIME_REASONS } from '@/lib/factory';

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Daily production entry: one row per date+product — re-submitting the same
// day+product edits it (server upsert), so no duplicate risk in the yard.
export default function FactoryProductionEntry() {
  const products = useFactoryProducts();
  const log = useFactoryLog();
  const save = useSaveProductionLog();

  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [bags, setBags] = useState('');
  const [downtime, setDowntime] = useState('None');
  const [remarks, setRemarks] = useState('');

  const submit = () => {
    save.mutate(
      {
        log_date: todayISO(),
        product_id: productId,
        qty_produced: Number(qty.replace(/[,\s]/g, '')),
        cement_bags: bags === '' ? null : Number(bags.replace(/[,\s]/g, '')),
        downtime_reason: downtime,
        remarks: remarks.trim() || null,
      },
      {
        onSuccess: () => {
          setQty('');
          setBags('');
          setRemarks('');
        },
      },
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-10">
      <Text className="mb-2 text-sm font-bold text-ink">
        Today · {todayISO()}
      </Text>

      {/* product picker */}
      <View className="mb-3 flex-row flex-wrap gap-2">
        {(products.data?.data ?? []).map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setProductId(p.id)}
            className={`rounded-full px-4 py-2 ${
              productId === p.id ? 'bg-ink' : 'bg-slate-200'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                productId === p.id ? 'text-white' : 'text-slate-600'
              }`}
            >
              {p.code}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row gap-2">
        <TextInput
          value={qty}
          onChangeText={setQty}
          keyboardType="numeric"
          placeholder="Qty produced"
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
        />
        <TextInput
          value={bags}
          onChangeText={setBags}
          keyboardType="numeric"
          placeholder="Cement bags"
          placeholderTextColor="#94a3b8"
          className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
        />
      </View>

      <Text className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Downtime reason
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {DOWNTIME_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setDowntime(r)}
            className={`rounded-full px-3 py-1.5 ${
              downtime === r ? 'bg-brand' : 'bg-slate-200'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                downtime === r ? 'text-ink' : 'text-slate-600'
              }`}
            >
              {r}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={remarks}
        onChangeText={setRemarks}
        placeholder="Remarks (optional)"
        placeholderTextColor="#94a3b8"
        multiline
        className="mt-3 min-h-[60px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
      />

      <Pressable
        onPress={submit}
        disabled={save.isPending || !productId || qty.trim() === ''}
        className={`mt-4 items-center rounded-xl py-3 ${
          save.isPending || !productId || qty.trim() === ''
            ? 'bg-slate-200'
            : 'bg-brand active:opacity-80'
        }`}
      >
        {save.isPending ? (
          <ActivityIndicator size="small" color="#0f172a" />
        ) : (
          <Text className="font-bold text-ink">Save production day</Text>
        )}
      </Pressable>

      {/* recent entries */}
      <Text className="mb-2 mt-6 text-sm font-bold text-ink">Recent days</Text>
      {(log.data?.data ?? []).slice(0, 14).map((r) => (
        <View
          key={r.id}
          className="mb-1.5 flex-row items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
        >
          <Text className="w-20 text-xs text-slate-400">{r.log_date.slice(5)}</Text>
          <Text className="w-14 text-sm font-semibold text-ink">
            {r.factory_products?.code}
          </Text>
          <Text className="w-16 text-right text-sm font-medium text-ink">
            {Number(r.qty_produced).toLocaleString('en-IN')}
          </Text>
          <Text className="flex-1 pl-2 text-xs text-slate-400" numberOfLines={1}>
            {r.downtime_reason !== 'None' ? `⚠️ ${r.downtime_reason}` : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
