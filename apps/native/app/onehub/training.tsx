import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  useCompleteLesson,
  useTrainingModule,
  useTrainingModules,
  type TrainingLesson,
} from '@/hooks/use-training';
import { toast } from '@/lib/toast';

const DIFFICULTY_BADGE: Record<string, string> = {
  beginner: '🟢',
  intermediate: '🟡',
  advanced: '🔴',
};

function LessonCard({ lesson }: { lesson: TrainingLesson }) {
  const [open, setOpen] = useState(false);
  const complete = useCompleteLesson();

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center p-3.5 active:opacity-70"
      >
        <Text className="mr-2 text-base">{lesson.completed ? '✅' : '📖'}</Text>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
            {lesson.title}
          </Text>
          <Text className="text-xs text-slate-400">
            ~{lesson.estimated_minutes} min{lesson.completed ? ' · completed' : ''}
          </Text>
        </View>
        <Text className="text-slate-400">{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? (
        <View className="border-t border-slate-100 px-4 pb-4 pt-3">
          {lesson.objective ? (
            <Text className="mb-2 text-xs font-semibold text-orange-600">
              🎯 {lesson.objective}
            </Text>
          ) : null}
          <Text className="text-sm leading-6 text-slate-700">{lesson.content}</Text>
          {lesson.examples ? (
            <View className="mt-3 rounded-lg bg-canvas p-3">
              <Text className="text-xs font-semibold text-slate-500">EXAMPLES</Text>
              <Text className="mt-1 text-sm leading-5 text-slate-600">
                {lesson.examples}
              </Text>
            </View>
          ) : null}
          {lesson.do_dont_notes ? (
            <View className="mt-2 rounded-lg bg-amber-50 p-3">
              <Text className="text-xs font-semibold text-amber-700">DO / DON'T</Text>
              <Text className="mt-1 text-sm leading-5 text-amber-800">
                {lesson.do_dont_notes}
              </Text>
            </View>
          ) : null}
          {!lesson.completed ? (
            <Pressable
              disabled={complete.isPending}
              onPress={() =>
                complete.mutate(lesson.id, {
                  onSuccess: () => toast.success('Lesson completed 🎉'),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : 'Failed'),
                })
              }
              className={`mt-3 items-center rounded-lg py-2.5 ${
                complete.isPending ? 'bg-slate-200' : 'bg-green-500 active:opacity-80'
              }`}
            >
              {complete.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  ✓ Mark as completed
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function TrainingScreen() {
  const modules = useTrainingModules();
  const [openModule, setOpenModule] = useState<string | null>(null);
  const detail = useTrainingModule(openModule);

  const list = modules.data?.data ?? [];

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="p-4 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={modules.isRefetching}
          onRefresh={() => void modules.refetch()}
        />
      }
    >
      <Text className="mb-1 text-base font-bold text-ink">🎓 Training</Text>
      <Text className="mb-3 text-xs text-slate-400">
        Short lessons on products, process and selling — complete them at your
        own pace. Quizzes are on the web app (Coaching → Learn).
      </Text>

      {modules.isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
      ) : modules.isError ? (
        <Text className="mt-10 text-center text-red-500">
          {modules.error instanceof Error ? modules.error.message : 'Failed to load'}
        </Text>
      ) : list.length === 0 ? (
        <Text className="mt-10 text-center text-slate-400">
          No training modules yet.
        </Text>
      ) : (
        list.map((m) => (
          <View key={m.id} className="mb-3">
            <Pressable
              onPress={() => setOpenModule(openModule === m.id ? null : m.id)}
              className={`rounded-xl p-4 active:opacity-80 ${
                openModule === m.id ? 'bg-ink' : 'border border-slate-200 bg-white'
              }`}
            >
              <View className="flex-row items-center">
                <View className="min-w-0 flex-1 pr-2">
                  <Text
                    className={`text-sm font-bold ${openModule === m.id ? 'text-white' : 'text-ink'}`}
                    numberOfLines={2}
                  >
                    {DIFFICULTY_BADGE[m.difficulty] ?? '📘'} {m.title}
                    {m.is_required ? ' *' : ''}
                  </Text>
                  {m.description ? (
                    <Text
                      className={`mt-0.5 text-xs ${openModule === m.id ? 'text-slate-300' : 'text-slate-400'}`}
                      numberOfLines={2}
                    >
                      {m.description}
                    </Text>
                  ) : null}
                </View>
                <Text className={openModule === m.id ? 'text-slate-300' : 'text-slate-400'}>
                  {openModule === m.id ? '▾' : '▸'}
                </Text>
              </View>
            </Pressable>

            {openModule === m.id ? (
              detail.isLoading ? (
                <ActivityIndicator color="#f97316" className="my-4" />
              ) : (
                <View className="mt-2">
                  {(detail.data?.data.lessons ?? []).map((l) => (
                    <LessonCard key={l.id} lesson={l} />
                  ))}
                  {(detail.data?.data.lessons ?? []).length === 0 ? (
                    <Text className="my-3 text-center text-xs text-slate-400">
                      No lessons in this module yet.
                    </Text>
                  ) : null}
                </View>
              )
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}
