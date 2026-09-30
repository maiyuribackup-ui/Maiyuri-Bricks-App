import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFactoryStock } from '@/hooks/use-factory';
import { useMyProfile } from '@/hooks/use-push-settings';
import { useAuth } from '@/store/auth';

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN');

export default function FactoryHome() {
  const { data, isLoading } = useFactoryStock();
  const userId = useAuth((s) => s.session?.user?.id);
  const profile = useMyProfile(userId);
  const role = profile.data?.data.role ?? '';
  const isDriver = role === 'driver';

  const uncounted = (data?.data ?? []).filter((p) => !p.opening_counted_at);

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-10">
      {uncounted.length > 0 ? (
        <View className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <Text className="text-xs font-semibold text-amber-800">
            ⚠️ Opening stock not counted ({uncounted.map((p) => p.code).join(', ')}).
            Balances assume 0 as at 01/07 — enter the yard count on the web app.
          </Text>
        </View>
      ) : null}

      {/* stock cards */}
      <Text className="mb-2 text-base font-bold text-ink">Free stock (promisable)</Text>
      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-6" />
      ) : (
        <View className="flex-row flex-wrap justify-between">
          {(data?.data ?? []).map((p) => (
            <View
              key={p.id}
              className="mb-3 w-[48.5%] rounded-xl border border-slate-200 bg-white p-3.5"
            >
              <Text className="text-sm font-bold text-ink">{p.code}</Text>
              <Text
                className={`mt-1 text-2xl font-bold ${
                  p.free_stock < 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {fmt(p.free_stock)}
              </Text>
              <Text className="text-[11px] text-slate-400">
                bal {fmt(p.stock_balance)} · committed {fmt(p.committed)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* actions */}
      {!isDriver ? (
        <Link href={'/factory/production' as import('expo-router').Href} asChild>
          <Pressable className="mb-2.5 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
            <Text className="mr-3 text-2xl">⚙️</Text>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink">Record today's production</Text>
              <Text className="text-xs text-slate-400">Qty, cement bags, downtime reason</Text>
            </View>
            <Text className="text-slate-400">→</Text>
          </Pressable>
        </Link>
      ) : null}
      <Link href={'/factory/deliveries' as import('expo-router').Href} asChild>
        <Pressable className="mb-2.5 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
          <Text className="mr-3 text-2xl">🚚</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink">Delivery schedule</Text>
            <Text className="text-xs text-slate-400">This week Sat–Fri · mark delivered</Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </Pressable>
      </Link>
      {!isDriver ? (
        <Link href={'/factory/labour' as import('expo-router').Href} asChild>
          <Pressable className="mb-2.5 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
            <Text className="mr-3 text-2xl">👷</Text>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink">Labour & wages entry</Text>
              <Text className="text-xs text-slate-400">Loading, production, NMR, advances</Text>
            </View>
            <Text className="text-slate-400">→</Text>
          </Pressable>
        </Link>
      ) : null}
    </ScrollView>
  );
}
