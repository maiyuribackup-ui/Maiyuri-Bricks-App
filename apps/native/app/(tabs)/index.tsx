import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDashboardStats } from '@/hooks/use-dashboard';

type CardDef = {
  key: keyof import('@/hooks/use-dashboard').DashboardStats;
  label: string;
  accent: string; // left border colour
};

const CARDS: CardDef[] = [
  { key: 'totalLeads', label: 'Total Leads', accent: 'border-l-slate-500' },
  { key: 'hotLeads', label: 'Hot Leads', accent: 'border-l-red-500' },
  { key: 'dueToday', label: 'Due Today', accent: 'border-l-amber-500' },
  { key: 'converted', label: 'Converted', accent: 'border-l-green-500' },
  { key: 'newLeads', label: 'New', accent: 'border-l-sky-500' },
  { key: 'followUp', label: 'Follow-up', accent: 'border-l-violet-500' },
  { key: 'cold', label: 'Cold', accent: 'border-l-blue-400' },
  { key: 'lost', label: 'Lost', accent: 'border-l-slate-400' },
];

export default function DashboardScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useDashboardStats();
  const stats = data?.data;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (isError || !stats) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Text className="text-center text-red-500">
          {error instanceof Error ? error.message : 'Failed to load dashboard'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-4 rounded-xl bg-brand px-5 py-2.5"
        >
          <Text className="font-semibold text-ink">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <View className="flex-row flex-wrap justify-between">
          {CARDS.map((card) => (
            <Pressable
              key={card.key}
              onPress={() => router.push('/(tabs)/leads')}
              className={`mb-3 w-[48.5%] rounded-xl border border-slate-200 border-l-4 bg-white p-4 active:opacity-70 ${card.accent}`}
            >
              <Text className="text-3xl font-bold text-ink">
                {stats[card.key] ?? 0}
              </Text>
              <Text className="mt-1 text-sm text-slate-500">{card.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-4 text-center text-xs text-slate-400">
          Tap a card to open leads · pull down to refresh
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
