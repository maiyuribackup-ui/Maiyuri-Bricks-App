import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLead } from '@/hooks/use-leads';
import { useAddNote, useLeadNotes } from '@/hooks/use-notes';
import { toast } from '@/lib/toast';

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View className="border-b border-slate-100 py-3">
      <Text className="text-xs uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="mt-1 text-base text-ink">{String(value)}</Text>
    </View>
  );
}

function NotesSection({ leadId }: { leadId: string }) {
  const { data, isLoading } = useLeadNotes(leadId);
  const addNote = useAddNote(leadId);
  const [text, setText] = useState('');
  const notes = data?.data ?? [];

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || addNote.isPending) return;
    addNote.mutate(trimmed, {
      onSuccess: () => {
        setText('');
        toast.success('Note added');
      },
    });
  };

  return (
    <View className="mt-2 px-5">
      <Text className="mb-2 text-base font-bold text-ink">
        📝 Notes{notes.length ? ` (${notes.length})` : ''}
      </Text>

      {/* composer */}
      <View className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Add a note about this lead…"
          placeholderTextColor="#94a3b8"
          multiline
          className="min-h-[40px] px-2 py-1 text-sm text-ink"
        />
        <View className="flex-row items-center justify-between px-1">
          {addNote.isError ? (
            <Text className="flex-1 text-xs text-red-500" numberOfLines={1}>
              {addNote.error instanceof Error ? addNote.error.message : 'Failed to save'}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          <Pressable
            onPress={submit}
            disabled={!text.trim() || addNote.isPending}
            className={`rounded-lg px-4 py-1.5 ${
              !text.trim() || addNote.isPending ? 'bg-slate-200' : 'bg-brand active:opacity-80'
            }`}
          >
            {addNote.isPending ? (
              <ActivityIndicator size="small" color="#0f172a" />
            ) : (
              <Text className="text-sm font-semibold text-ink">Save</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* list */}
      {isLoading ? (
        <ActivityIndicator color="#f97316" />
      ) : notes.length === 0 ? (
        <Text className="mb-4 text-sm text-slate-400">No notes yet — add the first one.</Text>
      ) : (
        notes.map((n) => (
          <View key={n.id} className="mb-2 rounded-xl border border-slate-100 bg-white p-3">
            <Text className="text-sm leading-5 text-slate-700">{n.text}</Text>
            {n.transcription_text ? (
              <Text className="mt-1 text-xs italic text-slate-400" numberOfLines={3}>
                🎙️ {n.transcription_text}
              </Text>
            ) : null}
            {n.ai_summary ? (
              <Text className="mt-1 text-xs text-violet-500" numberOfLines={3}>
                ✨ {n.ai_summary}
              </Text>
            ) : null}
            <Text className="mt-1.5 text-xs text-slate-400">
              {new Date(n.date ?? n.created_at).toLocaleString()}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error } = useLead(id);
  const lead = data?.data;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (isError || !lead) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-500">
          {error instanceof Error ? error.message : 'Lead not found'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
    <ScrollView className="flex-1 bg-white" keyboardShouldPersistTaps="handled">
      <View className="bg-ink px-5 pb-6 pt-4">
        <Text className="text-2xl font-bold text-white">{lead.name}</Text>
        <Text className="mt-1 text-base text-slate-300">{lead.contact}</Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable
            onPress={() => Linking.openURL(`tel:${lead.contact}`)}
            className="rounded-lg bg-brand px-4 py-2"
          >
            <Text className="font-semibold text-ink">Call</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(`https://wa.me/${lead.contact.replace(/[^0-9]/g, '')}`)}
            className="rounded-lg bg-green-500 px-4 py-2"
          >
            <Text className="font-semibold text-white">WhatsApp</Text>
          </Pressable>
        </View>
      </View>

      <View className="px-5">
        <Field label="Status" value={lead.lead_status?.replaceAll('_', ' ')} />
        <Field label="Pipeline stage" value={lead.pipeline_stage?.replaceAll('_', ' ')} />
        <Field label="Temperature" value={lead.lead_temperature} />
        <Field label="Classification" value={lead.classification?.replaceAll('_', ' ')} />
        <Field label="Requirement" value={lead.requirement_type?.replaceAll('_', ' ')} />
        <Field label="Source" value={lead.source} />
        <Field label="Site location" value={lead.site_location} />
        <Field label="Estimated value" value={lead.estimated_value} />
        <Field label="AI score" value={lead.ai_score} />
        <Field label="Next action" value={lead.next_action} />
        <Field label="Follow-up date" value={lead.follow_up_date} />
        <Field label="AI summary" value={lead.ai_summary} />
        <Field label="Staff notes" value={lead.staff_notes} />
      </View>

      <NotesSection leadId={lead.id} />

      <View className="h-10" />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
