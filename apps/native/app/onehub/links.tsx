import { useMemo } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useOneHubLinks } from '@/hooks/use-onehub';

export default function LinksScreen() {
  const { data, isLoading } = useOneHubLinks();

  const byCategory = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>['data']>();
    for (const link of data?.data ?? []) {
      const arr = map.get(link.category) ?? [];
      arr.push(link);
      map.set(link.category, arr);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-10">
      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
      ) : (
        byCategory.map(([category, links]) => (
          <View key={category} className="mb-4">
            <Text className="mb-2 text-base font-bold text-ink">{category}</Text>
            {links!.map((link) => {
              const placeholder = link.url === 'https://';
              return (
                <Pressable
                  key={link.id}
                  disabled={placeholder}
                  onPress={() => Linking.openURL(link.url)}
                  className={`mb-2 rounded-xl border border-slate-200 bg-white p-3.5 ${placeholder ? 'opacity-50' : 'active:opacity-70'}`}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                      🔗 {link.name}
                    </Text>
                    {placeholder ? (
                      <Text className="text-xs text-amber-600">link pending</Text>
                    ) : (
                      <Text className="text-slate-400">↗</Text>
                    )}
                  </View>
                  {link.purpose ? (
                    <Text className="mt-0.5 text-xs text-slate-400">{link.purpose}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}
