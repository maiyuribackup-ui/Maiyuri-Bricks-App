import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAskMayur } from '@/hooks/use-onehub';

type Entry = {
  question: string;
  answer: string;
  confidence: number;
  sources: number;
};

export default function AskMayurScreen() {
  const ask = useAskMayur();
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<'en' | 'ta'>('en');
  const [history, setHistory] = useState<Entry[]>([]);

  const submit = () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    ask.mutate(
      { question: q, language },
      {
        onSuccess: (res) => {
          setHistory((h) => [
            {
              question: q,
              answer: res.data.answer,
              confidence: res.data.confidence,
              sources: res.data.sources?.length ?? 0,
            },
            ...h,
          ]);
          setQuestion('');
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-50"
    >
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-4">
        <View className="flex-row items-center rounded-2xl bg-ink p-4">
          <Text className="mr-3 text-3xl">🦚</Text>
          <View className="flex-1">
            <Text className="text-base font-bold text-white">Mayur</Text>
            <Text className="text-xs text-slate-300">
              Ask about products, prices, process, SOPs — I answer from Maiyuri's
              own knowledge.
            </Text>
          </View>
        </View>

        {history.length === 0 && !ask.isPending ? (
          <View className="mt-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Try asking
            </Text>
            {[
              'How do I handle a new lead?',
              'What should I do during a factory visit?',
              'Why is Maiyuri better than Kerala bricks?',
              'இன்று உற்பத்தி திட்டம் எப்படி செய்வது?',
            ].map((q) => (
              <Pressable
                key={q}
                onPress={() => setQuestion(q)}
                className="mb-2 rounded-xl border border-slate-200 bg-white p-3 active:opacity-70"
              >
                <Text className="text-sm text-slate-600">💬 {q}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {ask.isPending ? (
          <View className="mt-4 flex-row items-center rounded-xl border border-slate-200 bg-white p-4">
            <ActivityIndicator color="#f97316" />
            <Text className="ml-3 text-sm text-slate-500">Mayur is thinking…</Text>
          </View>
        ) : null}
        {ask.isError ? (
          <Text className="mt-3 text-sm text-red-500">
            {ask.error instanceof Error ? ask.error.message : 'Something went wrong'}
          </Text>
        ) : null}

        {history.map((entry, i) => (
          <View key={i} className="mt-4">
            <View className="self-end rounded-2xl rounded-br-sm bg-ink px-4 py-2.5">
              <Text className="text-sm text-white">{entry.question}</Text>
            </View>
            <View className="mt-2 self-start rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3">
              <Text className="text-sm leading-6 text-ink">{entry.answer}</Text>
              <Text className="mt-2 text-xs text-slate-400">
                🦚 {entry.sources} source{entry.sources === 1 ? '' : 's'} ·{' '}
                {Math.round(entry.confidence * 100)}% confident
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="border-t border-slate-200 bg-white p-3">
        <View className="mb-2 flex-row gap-2">
          {(['en', 'ta'] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLanguage(l)}
              className={`rounded-full px-3 py-1 ${language === l ? 'bg-ink' : 'bg-slate-100'}`}
            >
              <Text className={`text-xs font-semibold ${language === l ? 'text-white' : 'text-slate-500'}`}>
                {l === 'en' ? 'English' : 'தமிழ்'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row items-end gap-2">
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder={language === 'ta' ? 'உங்கள் கேள்வியை கேளுங்கள்…' : 'Ask Mayur anything…'}
            placeholderTextColor="#94a3b8"
            multiline
            className="max-h-24 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-ink"
          />
          <Pressable
            onPress={submit}
            disabled={ask.isPending || !question.trim()}
            className={`h-11 w-11 items-center justify-center rounded-full ${
              ask.isPending || !question.trim() ? 'bg-slate-200' : 'bg-brand active:opacity-80'
            }`}
          >
            <Text className="text-lg">➤</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
