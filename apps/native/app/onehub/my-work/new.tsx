import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WORK_ADMIN_ROLES, useMyRole } from '@/hooks/use-approvals';
import {
  useAssignableUsers,
  useChecklistTemplatesList,
  useCreateWorkItem,
} from '@/hooks/use-my-work';
import { toast } from '@/lib/toast';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

/** Quick due presets — typing ISO dates on a phone is not happening. */
const DUE_PRESETS: { label: string; hours: number | null }[] = [
  { label: 'No due', hours: null },
  { label: 'Today 6pm', hours: -1 }, // special-cased below
  { label: 'Tomorrow 9am', hours: -2 },
  { label: 'In 3 days', hours: 72 },
];

function presetToIso(hours: number | null): string | null {
  if (hours === null) return null;
  const d = new Date();
  if (hours === -1) {
    d.setHours(18, 0, 0, 0);
  } else if (hours === -2) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    d.setTime(d.getTime() + hours * 3_600_000);
  }
  return d.toISOString();
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 mr-2 rounded-full px-3 py-1.5 ${
        active ? 'bg-ink' : 'border border-slate-200 bg-white'
      }`}
    >
      <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-slate-600'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AssignWorkScreen() {
  const router = useRouter();
  const role = useMyRole();
  const isAdmin = WORK_ADMIN_ROLES.includes(role);

  const users = useAssignableUsers(isAdmin);
  const templates = useChecklistTemplatesList(isAdmin);
  const create = useCreateWorkItem();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [duePreset, setDuePreset] = useState(0);
  const [requiresNote, setRequiresNote] = useState(false);
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);

  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-center text-sm text-slate-400">
          Only founders, owners and supervisors can assign work.
        </Text>
      </View>
    );
  }

  const submit = () => {
    if (!title.trim()) return toast.error('Give the task a title');
    if (!assignee) return toast.error('Pick who should do this');
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        assigned_user_id: assignee,
        activity_type: templateId ? 'checklist' : 'simple',
        checklist_template_id: templateId,
        priority,
        due_at: presetToIso(DUE_PRESETS[duePreset].hours),
        requires_note: requiresNote,
        requires_photo: requiresPhoto,
        requires_approval: requiresApproval,
      },
      {
        onSuccess: () => {
          toast.success('Assigned ✅ — they get a push now');
          router.back();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Assign failed'),
      },
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-16">
      <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Task
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="What needs to be done?"
        placeholderTextColor="#94a3b8"
        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Details / instructions (optional)"
        placeholderTextColor="#94a3b8"
        multiline
        className="mt-2 min-h-[64px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
      />

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Assign to
      </Text>
      {users.isLoading ? (
        <ActivityIndicator color="#f97316" />
      ) : (
        <View className="flex-row flex-wrap">
          {(users.data?.data ?? []).map((u) => (
            <Chip
              key={u.id}
              label={`${u.name} · ${u.role.replace(/_/g, ' ')}`}
              active={assignee === u.id}
              onPress={() => setAssignee(u.id)}
            />
          ))}
        </View>
      )}

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Checklist (optional — turns the task into a tick-list)
      </Text>
      <View className="flex-row flex-wrap">
        <Chip
          label="No checklist"
          active={templateId === null}
          onPress={() => setTemplateId(null)}
        />
        {(templates.data?.data ?? []).map((t) => (
          <Chip
            key={t.id}
            label={t.name}
            active={templateId === t.id}
            onPress={() => setTemplateId(t.id)}
          />
        ))}
      </View>

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Priority
      </Text>
      <View className="flex-row flex-wrap">
        {PRIORITIES.map((p) => (
          <Chip key={p} label={p} active={priority === p} onPress={() => setPriority(p)} />
        ))}
      </View>

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Due
      </Text>
      <View className="flex-row flex-wrap">
        {DUE_PRESETS.map((d, i) => (
          <Chip
            key={d.label}
            label={d.label}
            active={duePreset === i}
            onPress={() => setDuePreset(i)}
          />
        ))}
      </View>

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Proof required
      </Text>
      <View className="flex-row flex-wrap">
        <Chip
          label={`📝 Note ${requiresNote ? '✓' : ''}`}
          active={requiresNote}
          onPress={() => setRequiresNote((v) => !v)}
        />
        <Chip
          label={`📷 Photo ${requiresPhoto ? '✓' : ''}`}
          active={requiresPhoto}
          onPress={() => setRequiresPhoto((v) => !v)}
        />
        <Chip
          label={`👀 Needs approval ${requiresApproval ? '✓' : ''}`}
          active={requiresApproval}
          onPress={() => setRequiresApproval((v) => !v)}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={create.isPending}
        className={`mt-6 items-center rounded-xl py-3.5 ${
          create.isPending ? 'bg-slate-200' : 'bg-brand active:opacity-80'
        }`}
      >
        {create.isPending ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text className="text-base font-bold text-ink">Assign Task</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
