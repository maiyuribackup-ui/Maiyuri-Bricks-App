import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFactorySchedule, useUpdateDeliveryStatus } from '@/hooks/use-factory';
import { factoryWeekStart, parseISODate, toISODate } from '@/lib/factory';

const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function FactoryDeliverySchedule() {
  const [anchor, setAnchor] = useState(toISODate(new Date()));
  const weekStart = factoryWeekStart(anchor);
  const { data, isLoading } = useFactorySchedule(weekStart);
  const update = useUpdateDeliveryStatus(weekStart);

  const shiftWeek = (days: number) => {
    const d = parseISODate(weekStart);
    d.setDate(d.getDate() + days);
    setAnchor(toISODate(d));
  };

  const byDay = useMemo(() => {
    const days: { date: string; name: string; rows: NonNullable<typeof data>['data'] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = parseISODate(weekStart);
      d.setDate(d.getDate() + i);
      days.push({ date: toISODate(d), name: DAY_NAMES[i], rows: [] });
    }
    for (const row of data?.data ?? []) {
      days.find((d) => d.date === row.delivery_date)?.rows.push(row);
    }
    return days.filter((d) => d.rows.length > 0);
  }, [data, weekStart]);

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-10">
      {/* week nav */}
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable onPress={() => shiftWeek(-7)} className="rounded-lg bg-slate-200 px-3 py-1.5">
          <Text className="font-semibold text-slate-600">←</Text>
        </Pressable>
        <Text className="text-sm font-bold text-ink">
          Week of Sat {weekStart.slice(5)}
        </Text>
        <Pressable onPress={() => shiftWeek(7)} className="rounded-lg bg-slate-200 px-3 py-1.5">
          <Text className="font-semibold text-slate-600">→</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-8" />
      ) : byDay.length === 0 ? (
        <Text className="mt-8 text-center text-sm text-slate-400">
          No deliveries scheduled this week.
        </Text>
      ) : (
        byDay.map((day) => (
          <View key={day.date} className="mb-3">
            <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              {day.name} {day.date.slice(5)}
            </Text>
            {day.rows.map((r) => {
              const hold = r.factory_customers?.credit_hold;
              return (
                <View
                  key={r.id}
                  className="mb-1.5 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <View className="flex-row items-center">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {r.factory_customers?.name ?? '?'} — {Number(r.qty).toLocaleString('en-IN')}{' '}
                        {r.factory_products?.code}
                      </Text>
                      {hold ? (
                        <Text className="text-xs font-bold text-red-600">
                          🚫 CREDIT HOLD — do not dispatch
                        </Text>
                      ) : null}
                      {r.data_flag !== 'OK' ? (
                        <Text className="text-xs text-amber-600">⚠️ {r.data_flag}</Text>
                      ) : null}
                    </View>
                    <Text
                      className={`text-xs font-bold ${
                        r.status === 'Delivered'
                          ? 'text-green-600'
                          : r.status === 'Postponed'
                            ? 'text-amber-600'
                            : r.status === 'Cancelled'
                              ? 'text-slate-400 line-through'
                              : 'text-sky-600'
                      }`}
                    >
                      {r.status}
                    </Text>
                  </View>
                  {(r.status === 'Planned' || r.status === 'Postponed') && !hold ? (
                    <View className="mt-2 flex-row gap-2">
                      <Pressable
                        onPress={() => update.mutate({ id: r.id, status: 'Delivered' })}
                        disabled={update.isPending}
                        className="flex-1 items-center rounded-lg bg-green-600 py-2 active:opacity-80"
                      >
                        <Text className="text-xs font-bold text-white">✓ Delivered</Text>
                      </Pressable>
                      {r.status === 'Planned' ? (
                        <Pressable
                          onPress={() => update.mutate({ id: r.id, status: 'Postponed' })}
                          disabled={update.isPending}
                          className="flex-1 items-center rounded-lg border border-amber-400 py-2 active:opacity-80"
                        >
                          <Text className="text-xs font-bold text-amber-700">Postpone</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}
