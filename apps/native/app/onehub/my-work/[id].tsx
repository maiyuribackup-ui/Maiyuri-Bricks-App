import { useLocalSearchParams } from 'expo-router';
import type {
  ChecklistResponseStatus,
  WorkChecklistTemplateItem,
  WorkItem,
} from '@maiyuri/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useCompleteWork,
  useSaveDraft,
  useStartWork,
  useSubmitChecklist,
  useUploadWorkPhoto,
  useWorkItem,
  type DraftResponse,
} from '@/hooks/use-my-work';
import { toast } from '@/lib/toast';

type LocalResp = {
  status?: ChecklistResponseStatus | null;
  text_value?: string | null;
  number_value?: number | null;
  note?: string | null;
};

const STATUS_CHIPS: { key: ChecklistResponseStatus; label: string; on: string }[] = [
  { key: 'completed', label: '✓ Done', on: 'bg-green-500' },
  { key: 'not_completed', label: '✗ Not done', on: 'bg-red-500' },
  { key: 'not_applicable', label: 'N/A', on: 'bg-slate-400' },
];

async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    toast.error('Camera permission denied');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ quality: 0.4 });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  return res.assets[0].uri;
}

export default function WorkItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useWorkItem(id);
  const item = data?.data;

  const start = useStartWork(id);
  const complete = useCompleteWork(id);
  const saveDraft = useSaveDraft(id);
  const submit = useSubmitChecklist(id);
  const uploadPhoto = useUploadWorkPhoto(id);

  // Local edit state, seeded once from the server payload.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [responses, setResponses] = useState<Record<string, LocalResp>>({});

  if (item && seededFor !== `${item.id}:${item.updated_at}`) {
    setSeededFor(`${item.id}:${item.updated_at}`);
    setNote(item.note ?? '');
    const seed: Record<string, LocalResp> = {};
    for (const r of item.checklist_instance?.responses ?? []) {
      seed[r.template_item_id] = {
        status: r.status,
        text_value: r.text_value,
        number_value: r.number_value,
        note: r.note,
      };
    }
    setResponses(seed);
  }

  if (isLoading || !item) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        {isLoading ? (
          <ActivityIndicator size="large" color="#f97316" />
        ) : (
          <Text className="text-slate-400">Work item not found</Text>
        )}
      </View>
    );
  }

  const templateItems = item.checklist_instance?.template?.items ?? [];
  const respIdByTemplateItem = new Map(
    (item.checklist_instance?.responses ?? []).map((r) => [r.template_item_id, r.id]),
  );
  const isChecklist = item.activity_type === 'checklist';
  const canAct = item.status === 'pending' || item.status === 'in_progress' || item.status === 'returned';
  const started = item.status === 'in_progress';
  const closed = ['submitted', 'completed', 'cancelled'].includes(item.status);
  const busy = start.isPending || complete.isPending || saveDraft.isPending || submit.isPending;

  const setResp = (tid: string, patch: LocalResp) =>
    setResponses((prev) => ({ ...prev, [tid]: { ...prev[tid], ...patch } }));

  const draftPayload = (): { note: string | null; responses: DraftResponse[] } => ({
    note: note.trim() || null,
    responses: templateItems.map((ti) => ({
      template_item_id: ti.id,
      status: responses[ti.id]?.status ?? null,
      text_value: responses[ti.id]?.text_value ?? null,
      number_value: responses[ti.id]?.number_value ?? null,
      note: responses[ti.id]?.note ?? null,
    })),
  });

  const onSaveProgress = () =>
    saveDraft.mutate(draftPayload(), {
      onSuccess: () => toast.success('Progress saved'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
    });

  const onSubmit = () => {
    // Persist answers first (mints response ids, satisfies server validation),
    // then submit for validation.
    saveDraft.mutate(draftPayload(), {
      onSuccess: () =>
        submit.mutate(undefined, {
          onSuccess: () => toast.success('Checklist submitted'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Submit failed'),
        }),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
    });
  };

  const onCompleteSimple = () =>
    complete.mutate(
      { note: note.trim() || null },
      {
        onSuccess: () =>
          toast.success(item.requires_approval ? 'Sent for approval' : 'Completed'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not complete'),
      },
    );

  const onItemPhoto = async (tid: string) => {
    const responseId = respIdByTemplateItem.get(tid);
    if (!responseId) {
      toast.info('Tap “Save progress” first, then add the photo');
      return;
    }
    const uri = await takePhoto();
    if (uri) {
      uploadPhoto.mutate(
        { uri, checklistResponseId: responseId },
        {
          onSuccess: () => toast.success('Photo added'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Upload failed'),
        },
      );
    }
  };

  const onSimplePhoto = async () => {
    const uri = await takePhoto();
    if (uri) {
      uploadPhoto.mutate(
        { uri },
        {
          onSuccess: () => toast.success('Photo added'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Upload failed'),
        },
      );
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 pb-16">
      {/* header */}
      <Text className="text-lg font-bold text-ink">{item.title}</Text>
      {item.description ? (
        <Text className="mt-1 text-sm text-slate-600">{item.description}</Text>
      ) : null}
      {item.instructions ? (
        <View className="mt-2 rounded-xl bg-slate-100 p-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Instructions
          </Text>
          <Text className="mt-1 text-sm leading-5 text-ink">{item.instructions}</Text>
        </View>
      ) : null}
      {item.linked_sop_slug ? (
        <Pressable
          onPress={() => Linking.openURL(`https://mb.maiyuri.com/onehub`)}
          className="mt-2"
        >
          <Text className="text-xs font-semibold text-brand">📖 Related SOP</Text>
        </Pressable>
      ) : null}

      {item.status === 'returned' && item.return_reason ? (
        <View className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <Text className="text-xs font-bold uppercase tracking-wider text-red-500">
            Returned for correction
          </Text>
          <Text className="mt-1 text-sm text-red-700">{item.return_reason}</Text>
        </View>
      ) : null}

      {/* Start gate */}
      {(item.status === 'pending' || item.status === 'returned') ? (
        <Pressable
          onPress={() => start.mutate()}
          disabled={busy}
          className={`mt-4 items-center rounded-xl py-3 ${busy ? 'bg-slate-200' : 'bg-brand active:opacity-80'}`}
        >
          {start.isPending ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text className="font-bold text-ink">▶️ Start work</Text>
          )}
        </Pressable>
      ) : null}

      {/* Checklist body */}
      {isChecklist && started ? (
        <View className="mt-4">
          <Text className="mb-2 text-sm font-bold text-ink">
            {item.checklist_instance?.template?.name ?? 'Checklist'}
          </Text>
          {templateItems.map((ti, idx) => (
            <ChecklistRow
              key={ti.id}
              index={idx + 1}
              ti={ti}
              value={responses[ti.id] ?? {}}
              onChange={(patch) => setResp(ti.id, patch)}
              onPhoto={() => onItemPhoto(ti.id)}
              photoPending={uploadPhoto.isPending}
            />
          ))}
        </View>
      ) : null}

      {/* Simple-task body */}
      {!isChecklist && started ? (
        <View className="mt-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Note {item.requires_note ? '(required)' : ''}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="What did you do?"
            placeholderTextColor="#94a3b8"
            multiline
            className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-ink"
          />
          {item.requires_photo ? (
            <Pressable
              onPress={onSimplePhoto}
              disabled={uploadPhoto.isPending}
              className="mt-3 flex-row items-center justify-center rounded-xl border-2 border-dashed border-slate-300 py-3 active:opacity-70"
            >
              {uploadPhoto.isPending ? (
                <ActivityIndicator color="#f97316" />
              ) : (
                <Text className="font-semibold text-slate-600">
                  📷 Add proof photo{item.attachments?.length ? ` (${item.attachments.length})` : ''}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* existing attachments preview */}
      {item.attachments?.length ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {item.attachments.map((a) =>
            a.url ? (
              <Image key={a.id} source={{ uri: a.url }} style={{ width: 64, height: 64, borderRadius: 8 }} />
            ) : null,
          )}
        </View>
      ) : null}

      {/* action bar */}
      {started ? (
        <View className="mt-5 flex-row gap-2">
          {isChecklist ? (
            <>
              <Pressable
                onPress={onSaveProgress}
                disabled={busy}
                className="flex-1 items-center rounded-xl border border-slate-300 py-3 active:opacity-70"
              >
                <Text className="font-semibold text-slate-600">Save progress</Text>
              </Pressable>
              <Pressable
                onPress={onSubmit}
                disabled={busy}
                className={`flex-[1.4] items-center rounded-xl py-3 ${busy ? 'bg-slate-200' : 'bg-green-500 active:opacity-80'}`}
              >
                {submit.isPending || saveDraft.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="font-bold text-white">Submit</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={onCompleteSimple}
              disabled={busy}
              className={`flex-1 items-center rounded-xl py-3 ${busy ? 'bg-slate-200' : 'bg-green-500 active:opacity-80'}`}
            >
              {complete.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="font-bold text-white">
                  {item.requires_approval ? 'Submit for approval' : 'Mark complete'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      {closed ? (
        <View className="mt-4 items-center rounded-xl border border-green-200 bg-green-50 p-4">
          <Text className="text-sm font-semibold text-green-700">
            {item.status === 'submitted'
              ? '⏳ Submitted — awaiting approval'
              : item.status === 'completed'
                ? '✅ Completed'
                : '🚫 Cancelled'}
          </Text>
        </View>
      ) : null}

      {!canAct && !closed ? (
        <Text className="mt-4 text-center text-sm text-slate-400">
          This item is {item.status}.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function ChecklistRow({
  index,
  ti,
  value,
  onChange,
  onPhoto,
  photoPending,
}: {
  index: number;
  ti: WorkChecklistTemplateItem;
  value: { status?: ChecklistResponseStatus | null; text_value?: string | null; number_value?: number | null; note?: string | null };
  onChange: (patch: {
    status?: ChecklistResponseStatus | null;
    text_value?: string | null;
    number_value?: number | null;
    note?: string | null;
  }) => void;
  onPhoto: () => void;
  photoPending: boolean;
}) {
  const failed = value.status === 'not_completed';
  const needsPhoto = ti.requires_photo || (ti.requires_photo_on_fail && failed);
  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
      <Text className="text-sm font-medium text-ink">
        {index}. {ti.prompt}
        {ti.mandatory ? <Text className="text-red-400"> *</Text> : null}
      </Text>

      {ti.input_type === 'status' ? (
        <View className="mt-2 flex-row gap-2">
          {STATUS_CHIPS.filter((c) => c.key !== 'not_applicable' || ti.allow_na).map((c) => {
            const active = value.status === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => onChange({ status: active ? null : c.key })}
                className={`rounded-lg px-3 py-1.5 ${active ? c.on : 'bg-slate-100'}`}
              >
                <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {ti.input_type === 'text' ? (
        <TextInput
          value={value.text_value ?? ''}
          onChangeText={(t) => onChange({ text_value: t })}
          placeholder="Enter value"
          placeholderTextColor="#94a3b8"
          className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-ink"
        />
      ) : null}

      {ti.input_type === 'number' ? (
        <TextInput
          value={value.number_value != null ? String(value.number_value) : ''}
          onChangeText={(t) => {
            const n = Number(t.replace(/[^0-9.]/g, ''));
            onChange({ number_value: t === '' || Number.isNaN(n) ? null : n });
          }}
          keyboardType="numeric"
          placeholder="Enter number"
          placeholderTextColor="#94a3b8"
          className="mt-2 w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-ink"
        />
      ) : null}

      {needsPhoto ? (
        <Pressable
          onPress={onPhoto}
          disabled={photoPending}
          className="mt-2 flex-row items-center self-start rounded-lg bg-slate-100 px-3 py-1.5 active:opacity-70"
        >
          <Text className="text-xs font-semibold text-slate-600">📷 Photo required</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
