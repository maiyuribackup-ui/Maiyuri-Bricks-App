import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useChecklists, useTickChecklist } from '@/hooks/use-onehub';

export default function ChecklistRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useChecklists();
  const tick = useTickChecklist(id);

  const run = (data?.data.runs ?? []).find((r) => r.id === id);
  const template = (data?.data.templates ?? []).find((t) => t.id === run?.template_id);

  if (isLoading || !run || !template) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        {isLoading ? (
          <ActivityIndicator size="large" color="#f97316" />
        ) : (
          <Text className="text-slate-400">Checklist not found</Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 pb-12">
      <Text className="text-lg font-bold text-ink">👤 {run.subject_name}</Text>
      {run.completed_at ? (
        <View className="mt-2 items-center rounded-2xl border border-green-200 bg-green-50 p-4">
          <Image
            source={require('../../../assets/onehub/mayur-celebrate.png')}
            style={{ width: 120, height: 120 }}
            resizeMode="contain"
          />
          <Text className="mt-2 text-sm font-semibold text-green-700">
            🎉 Onboarding completed {new Date(run.completed_at).toLocaleDateString('en-IN')}
          </Text>
        </View>
      ) : null}

      {template.phases.map((phase) => (
        <View key={phase.phase} className="mt-4">
          <Text className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">
            {phase.phase}
          </Text>
          {phase.items.map((item) => {
            const state = run.statuses?.[item.id];
            const done = !!state?.done;
            return (
              <Pressable
                key={item.id}
                onPress={() => tick.mutate({ item_id: item.id, done: !done })}
                disabled={tick.isPending}
                className={`mb-2 flex-row items-center rounded-xl border p-3.5 ${
                  done ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'
                } active:opacity-70`}
              >
                <View
                  className={`mr-3 h-6 w-6 items-center justify-center rounded-md border-2 ${
                    done ? 'border-green-500 bg-green-500' : 'border-slate-300 bg-white'
                  }`}
                >
                  {done ? <Text className="text-xs font-bold text-white">✓</Text> : null}
                </View>
                <View className="flex-1">
                  <Text className={`text-sm ${done ? 'text-slate-400 line-through' : 'text-ink'}`}>
                    {item.text}
                  </Text>
                  <Text className="text-xs capitalize text-slate-400">
                    Owner: {item.owner_role.replaceAll('_', ' ')}
                    {state?.at ? ` · done ${new Date(state.at).toLocaleDateString('en-IN')}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {tick.isError ? (
        <Text className="mt-2 text-sm text-red-500">
          {tick.error instanceof Error ? tick.error.message : 'Update failed'}
        </Text>
      ) : null}
    </ScrollView>
  );
}
