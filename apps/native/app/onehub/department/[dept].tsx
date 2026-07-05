import { Link, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useCanEdit, useSops } from '@/hooks/use-onehub';
import { DEPARTMENTS } from '../index';

export default function DepartmentSops() {
  const { dept } = useLocalSearchParams<{ dept: string }>();
  const { data, isLoading } = useSops(dept);
  const canEdit = useCanEdit();
  const meta = DEPARTMENTS.find((d) => d.key === dept);

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 pb-10">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-ink">
          {meta?.icon} {meta?.label ?? dept} <Text className="text-sm text-slate-400">{meta?.ta}</Text>
        </Text>
        {canEdit ? (
          <Link href={'/onehub/edit/new' as import('expo-router').Href} asChild>
            <Pressable className="rounded-full bg-brand px-3 py-1.5 active:opacity-80">
              <Text className="text-xs font-bold text-ink">+ New SOP</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
      ) : (data?.data ?? []).length === 0 ? (
        <View className="rounded-xl border border-slate-200 bg-white p-5">
          <Text className="text-sm text-slate-400">
            No SOPs here yet — they'll appear as the library grows.
          </Text>
        </View>
      ) : (
        (data?.data ?? []).map((sop) => (
          <Link key={sop.id} href={`/onehub/sop/${sop.slug}` as import("expo-router").Href} asChild>
            <Pressable className="mb-2 rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                  {sop.title_en}
                </Text>
                {sop.status === 'draft' ? (
                  <View className="ml-2 rounded-full bg-slate-200 px-2 py-0.5">
                    <Text className="text-xs text-slate-600">draft</Text>
                  </View>
                ) : null}
              </View>
              {sop.title_ta ? (
                <Text className="text-sm text-slate-500">{sop.title_ta}</Text>
              ) : null}
              <Text className="mt-1 text-xs text-slate-400">
                {sop.steps.length} steps · v{sop.version}
              </Text>
            </Pressable>
          </Link>
        ))
      )}
    </ScrollView>
  );
}
