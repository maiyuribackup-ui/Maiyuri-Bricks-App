import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useCanEdit, useSops } from '@/hooks/use-onehub';

type Lang = 'both' | 'en' | 'ta';

export default function SopViewer() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading } = useSops();
  const canEdit = useCanEdit();
  const [lang, setLang] = useState<Lang>('both');
  const sop = (data?.data ?? []).find((s) => s.slug === slug);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }
  if (!sop) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-slate-400">SOP not found</Text>
      </View>
    );
  }

  const showEn = lang !== 'ta';
  const showTa = lang !== 'en';

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-12">
      <View className="bg-ink px-5 pb-5 pt-4">
        {showEn ? (
          <Text className="text-xl font-bold text-white">{sop.title_en}</Text>
        ) : null}
        {showTa && sop.title_ta ? (
          <Text className={`${showEn ? 'mt-0.5 text-base text-brand' : 'text-xl font-bold text-brand'}`}>
            {sop.title_ta}
          </Text>
        ) : null}
        {sop.purpose_en && showEn ? (
          <Text className="mt-2 text-sm text-slate-300">{sop.purpose_en}</Text>
        ) : null}
        {sop.purpose_ta && showTa ? (
          <Text className="mt-1 text-sm text-slate-400">{sop.purpose_ta}</Text>
        ) : null}

        {/* language toggle */}
        <View className="mt-3 flex-row gap-2">
          {(['both', 'en', 'ta'] as Lang[]).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              className={`rounded-full px-3 py-1 ${lang === l ? 'bg-brand' : 'bg-slate-700'}`}
            >
              <Text className={`text-xs font-semibold ${lang === l ? 'text-ink' : 'text-slate-300'}`}>
                {l === 'both' ? 'EN + த' : l === 'en' ? 'English' : 'தமிழ்'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="px-5 pt-4">
        {sop.steps.map((step, i) => (
          <View key={i} className="mb-3 flex-row rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <View className="mr-3 items-center">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-ink">
                <Text className="text-sm font-bold text-white">{i + 1}</Text>
              </View>
              {step.icon ? <Text className="mt-1 text-lg">{step.icon}</Text> : null}
            </View>
            <View className="flex-1">
              {showEn ? (
                <Text className="text-[15px] leading-5 text-ink">{step.en}</Text>
              ) : null}
              {showTa && step.ta ? (
                <Text className={`text-[15px] leading-6 ${showEn ? 'mt-1 text-slate-500' : 'text-ink'}`}>
                  {step.ta}
                </Text>
              ) : null}
            </View>
          </View>
        ))}

        {sop.warning_en || sop.warning_ta ? (
          <View className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 p-4">
            <Text className="text-xs font-bold uppercase tracking-wider text-red-500">
              ⚠️ Important / முக்கியம்
            </Text>
            {showEn && sop.warning_en ? (
              <Text className="mt-1 text-sm leading-5 text-red-700">{sop.warning_en}</Text>
            ) : null}
            {showTa && sop.warning_ta ? (
              <Text className="mt-1 text-sm leading-6 text-red-600">{sop.warning_ta}</Text>
            ) : null}
          </View>
        ) : null}

        {sop.video_url ? (
          <Pressable
            onPress={() => Linking.openURL(sop.video_url!)}
            className="mt-4 flex-row items-center justify-center rounded-xl bg-ink py-3 active:opacity-80"
          >
            <Text className="font-semibold text-white">▶️ Watch video guide</Text>
          </Pressable>
        ) : null}

        {canEdit ? (
          <Link href={`/onehub/edit/${sop.slug}` as import('expo-router').Href} asChild>
            <Pressable className="mt-4 flex-row items-center justify-center rounded-xl border border-slate-300 py-3 active:opacity-70">
              <Text className="font-semibold text-slate-600">✏️ Edit this SOP</Text>
            </Pressable>
          </Link>
        ) : null}

        <Text className="mt-6 text-center text-xs text-slate-400">
          v{sop.version} · updated {new Date(sop.updated_at).toLocaleDateString('en-IN')}
        </Text>
      </View>
    </ScrollView>
  );
}
