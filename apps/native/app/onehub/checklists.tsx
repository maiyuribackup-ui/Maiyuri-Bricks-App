import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useChecklists, useStartChecklist } from '@/hooks/use-onehub';

export default function ChecklistsScreen() {
  const { data, isLoading } = useChecklists();
  const start = useStartChecklist();
  const [name, setName] = useState('');

  const template = data?.data.templates[0];
  const runs = data?.data.runs ?? [];
  const totalItems = (t: typeof template) =>
    (t?.phases ?? []).reduce((s, p) => s + p.items.length, 0);

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 pb-10">
      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
      ) : (
        <>
          {/* start a new run */}
          <View className="rounded-xl border border-slate-200 bg-white p-4">
            <Text className="text-sm font-bold text-ink">Start onboarding a new joiner</Text>
            <View className="mt-2 flex-row gap-2">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Joiner's name"
                placeholderTextColor="#94a3b8"
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-ink"
              />
              <Pressable
                onPress={() =>
                  template &&
                  name.trim() &&
                  start.mutate(
                    { template_id: template.id, subject_name: name.trim() },
                    { onSuccess: () => setName('') },
                  )
                }
                disabled={start.isPending || !name.trim() || !template}
                className={`items-center justify-center rounded-lg px-4 ${
                  start.isPending || !name.trim() ? 'bg-slate-200' : 'bg-brand active:opacity-80'
                }`}
              >
                {start.isPending ? (
                  <ActivityIndicator size="small" color="#0f172a" />
                ) : (
                  <Text className="text-sm font-semibold text-ink">Start</Text>
                )}
              </Pressable>
            </View>
            {start.isError ? (
              <Text className="mt-2 text-xs text-red-500">
                {start.error instanceof Error ? start.error.message : 'Failed'}
              </Text>
            ) : null}
          </View>

          {/* runs */}
          <Text className="mb-2 mt-4 text-base font-bold text-ink">In progress</Text>
          {runs.length === 0 ? (
            <Text className="text-sm text-slate-400">No joiners being onboarded yet.</Text>
          ) : (
            runs.map((run) => {
              const done = Object.keys(run.statuses ?? {}).length;
              const total = totalItems(template);
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <Link key={run.id} href={`/onehub/checklist/${run.id}` as import("expo-router").Href} asChild>
                  <Pressable className="mb-2 rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-base font-semibold text-ink">
                        {run.completed_at ? '🎉 ' : '👤 '}
                        {run.subject_name}
                      </Text>
                      <Text className="text-sm font-bold text-slate-500">{pct}%</Text>
                    </View>
                    <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <View
                        className={`h-2 rounded-full ${run.completed_at ? 'bg-green-500' : 'bg-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </View>
                    <Text className="mt-1 text-xs text-slate-400">
                      {done}/{total} done · started {new Date(run.started_at).toLocaleDateString('en-IN')}
                    </Text>
                  </Pressable>
                </Link>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}
