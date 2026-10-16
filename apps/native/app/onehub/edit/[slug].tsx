import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSaveSop, useSops, type Sop, type SopStep } from '@/hooks/use-onehub';
import { DEPARTMENTS } from '../index';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        className={`rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink ${
          multiline ? 'min-h-[64px]' : ''
        }`}
      />
    </View>
  );
}

export default function SopEditor() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const isNew = slug === 'new';
  const { data, isLoading } = useSops();
  const save = useSaveSop();
  const existing = useMemo(
    () => (data?.data ?? []).find((s) => s.slug === slug),
    [data, slug],
  );

  // Seed form state once data is available (or immediately for new).
  const [form, setForm] = useState<Partial<Sop> | null>(isNew ? blankSop() : null);
  if (!isNew && form === null && existing) setForm(existing);

  if (!isNew && (isLoading || form === null)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        {isLoading ? (
          <ActivityIndicator size="large" color="#f97316" />
        ) : (
          <Text className="text-slate-400">SOP not found</Text>
        )}
      </View>
    );
  }

  const f = form!;
  const set = (patch: Partial<Sop>) => setForm((prev) => ({ ...prev!, ...patch }));
  const steps = f.steps ?? [];
  const setStep = (i: number, patch: Partial<SopStep>) =>
    set({ steps: steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  const onSave = (status: 'draft' | 'published') => {
    const title = (f.title_en ?? '').trim();
    if (title.length < 2) {
      Alert.alert('Title required', 'Please enter an English title.');
      return;
    }
    if (steps.filter((s) => s.en.trim()).length < 1) {
      Alert.alert('Steps required', 'Add at least one step with English text.');
      return;
    }
    const payload: Partial<Sop> = {
      ...(existing ? { id: existing.id } : {}),
      department: f.department ?? 'sales',
      slug: isNew ? slugify(title) : f.slug!,
      title_en: title,
      title_ta: f.title_ta?.trim() || null,
      purpose_en: f.purpose_en?.trim() || null,
      purpose_ta: f.purpose_ta?.trim() || null,
      steps: steps
        .filter((s) => s.en.trim())
        .map((s) => ({ en: s.en.trim(), ta: s.ta?.trim() || '', icon: s.icon?.trim() || undefined })),
      warning_en: f.warning_en?.trim() || null,
      warning_ta: f.warning_ta?.trim() || null,
      video_url: f.video_url?.trim() || null,
      status,
    };
    save.mutate(payload, {
      onSuccess: () => {
        Alert.alert(
          status === 'published' ? 'Published ✅' : 'Saved as draft',
          status === 'published'
            ? 'This SOP is now live and Ask Mayur can answer from it.'
            : 'Only founders can see drafts until published.',
        );
        router.back();
      },
      onError: (e) =>
        Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error'),
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView contentContainerClassName="p-4 pb-32">
        {/* department */}
        <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Department
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {DEPARTMENTS.map((d) => (
            <Pressable
              key={d.key}
              onPress={() => set({ department: d.key as Sop['department'] })}
              className={`rounded-full px-3 py-1.5 ${
                (f.department ?? 'sales') === d.key ? 'bg-ink' : 'bg-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  (f.department ?? 'sales') === d.key ? 'text-white' : 'text-slate-600'
                }`}
              >
                {d.icon} {d.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field label="Title (English)" value={f.title_en ?? ''} onChange={(t) => set({ title_en: t })} placeholder="e.g. Handling Customer Complaints" />
        <Field label="Title (தமிழ்)" value={f.title_ta ?? ''} onChange={(t) => set({ title_ta: t })} placeholder="தலைப்பு" />
        <Field label="Purpose (English)" value={f.purpose_en ?? ''} onChange={(t) => set({ purpose_en: t })} placeholder="One line: why this SOP exists" multiline />
        <Field label="Purpose (தமிழ்)" value={f.purpose_ta ?? ''} onChange={(t) => set({ purpose_ta: t })} placeholder="நோக்கம்" multiline />

        {/* steps */}
        <View className="mb-2 mt-2 flex-row items-center justify-between">
          <Text className="text-sm font-bold text-ink">Steps ({steps.length})</Text>
          <Pressable
            onPress={() => set({ steps: [...steps, { en: '', ta: '', icon: '' }] })}
            className="rounded-full bg-brand px-3 py-1.5 active:opacity-80"
          >
            <Text className="text-xs font-bold text-ink">+ Add step</Text>
          </Pressable>
        </View>
        {steps.map((step, i) => (
          <View key={i} className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-xs font-bold text-slate-500">Step {i + 1}</Text>
              <Pressable onPress={() => set({ steps: steps.filter((_, idx) => idx !== i) })}>
                <Text className="text-xs font-semibold text-red-500">Remove</Text>
              </Pressable>
            </View>
            <View className="flex-row gap-2">
              <TextInput
                value={step.icon ?? ''}
                onChangeText={(t) => setStep(i, { icon: t })}
                placeholder="🔧"
                placeholderTextColor="#94a3b8"
                className="w-14 rounded-lg border border-slate-200 bg-canvas px-2 py-2 text-center text-lg"
              />
              <TextInput
                value={step.en}
                onChangeText={(t) => setStep(i, { en: t })}
                placeholder="Step in English"
                placeholderTextColor="#94a3b8"
                multiline
                className="flex-1 rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-ink"
              />
            </View>
            <TextInput
              value={step.ta ?? ''}
              onChangeText={(t) => setStep(i, { ta: t })}
              placeholder="படி (தமிழ்)"
              placeholderTextColor="#94a3b8"
              multiline
              className="mt-2 rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-ink"
            />
          </View>
        ))}

        <View className="mt-2">
          <Field label="⚠️ Warning (English)" value={f.warning_en ?? ''} onChange={(t) => set({ warning_en: t })} placeholder="The one thing they must never do" multiline />
          <Field label="⚠️ Warning (தமிழ்)" value={f.warning_ta ?? ''} onChange={(t) => set({ warning_ta: t })} placeholder="எச்சரிக்கை" multiline />
          <Field label="Video URL (optional)" value={f.video_url ?? ''} onChange={(t) => set({ video_url: t })} placeholder="https://youtube.com/..." />
        </View>
      </ScrollView>

      {/* save bar */}
      <View className="flex-row gap-3 border-t border-slate-200 bg-white p-3">
        <Pressable
          onPress={() => onSave('draft')}
          disabled={save.isPending}
          className="flex-1 items-center justify-center rounded-xl border border-slate-300 py-3 active:opacity-70"
        >
          <Text className="font-semibold text-slate-600">Save draft</Text>
        </Pressable>
        <Pressable
          onPress={() => onSave('published')}
          disabled={save.isPending}
          className={`flex-[1.4] items-center justify-center rounded-xl py-3 ${
            save.isPending ? 'bg-slate-300' : 'bg-brand active:opacity-80'
          }`}
        >
          {save.isPending ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text className="font-bold text-ink">Publish</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function blankSop(): Partial<Sop> {
  return {
    department: 'sales',
    title_en: '',
    title_ta: '',
    purpose_en: '',
    purpose_ta: '',
    steps: [{ en: '', ta: '', icon: '' }],
    warning_en: '',
    warning_ta: '',
    video_url: '',
    status: 'draft',
  };
}
