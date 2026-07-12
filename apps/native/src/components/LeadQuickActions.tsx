import type { Lead } from '@maiyuri/shared';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useUpdateLead } from '@/hooks/use-leads';
import {
  isoDate,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  PIPELINE_STAGES,
} from '@/lib/lead-taxonomy';

/**
 * ⚡ Quick Actions bottom sheet — status/stage/temperature/follow-up/next
 * action editing for a lead. Shared by the Leads list AND the lead detail
 * screen (audit #9: detail was read-only, forcing users back to the list).
 */

const FOLLOW_UP_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
];

function Chip({
  selected,
  disabled,
  onPress,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`mb-1.5 mr-1.5 flex-row items-center rounded-lg border px-2.5 py-1.5 ${
        selected ? 'border-ink bg-ink' : 'border-slate-200 bg-white'
      } ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
    >
      {children}
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

export function QuickActionsModal({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const update = useUpdateLead();
  // Accumulate applied patches so the panel reflects changes immediately even
  // though the `lead` prop is a snapshot from when the panel opened.
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [nextAction, setNextAction] = useState('');
  const [openedForId, setOpenedForId] = useState<string | null>(null);

  if (lead && lead.id !== openedForId) {
    setOpenedForId(lead.id);
    setPending({});
    setNextAction(lead.next_action ?? '');
  }

  const val = <K extends keyof Lead>(field: K): Lead[K] =>
    (pending[field] as Lead[K] | undefined) ?? (lead?.[field] as Lead[K]);

  const apply = (body: Record<string, unknown>) => {
    if (!lead) return;
    update.mutate(
      { id: lead.id, body },
      { onSuccess: () => setPending((p) => ({ ...p, ...body })) },
    );
  };

  const busy = update.isPending;

  return (
    <Modal visible={!!lead} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[85%] rounded-t-3xl bg-white">
          <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                ⚡ Quick Actions
              </Text>
              <Text className="text-sm text-slate-500" numberOfLines={1}>
                {lead?.name}
              </Text>
            </View>
            {busy ? <ActivityIndicator color="#f97316" /> : null}
          </View>

          <ScrollView className="px-5" contentContainerClassName="pb-6">
            {update.isError ? (
              <Text className="mt-3 text-sm text-red-500">
                {update.error instanceof Error
                  ? update.error.message
                  : 'Update failed'}
              </Text>
            ) : null}

            <SectionTitle>Status</SectionTitle>
            <View className="flex-row flex-wrap">
              {LEAD_STATUSES.map((s) => (
                <Chip
                  key={s.value}
                  selected={val('lead_status') === s.value}
                  disabled={busy}
                  onPress={() => apply({ lead_status: s.value })}
                >
                  <Text className="mr-1 text-xs">{s.emoji}</Text>
                  <Text
                    className={`text-xs font-medium ${
                      val('lead_status') === s.value ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    {s.label}
                  </Text>
                </Chip>
              ))}
            </View>

            <SectionTitle>Move to stage</SectionTitle>
            <View className="flex-row flex-wrap">
              {PIPELINE_STAGES.map((s) => (
                <Chip
                  key={s.value}
                  selected={val('pipeline_stage') === s.value}
                  disabled={busy}
                  onPress={() => apply({ pipeline_stage: s.value })}
                >
                  <Text className="mr-1 text-xs">{s.emoji}</Text>
                  <Text
                    className={`text-xs font-medium ${
                      val('pipeline_stage') === s.value ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    {s.label}
                  </Text>
                </Chip>
              ))}
            </View>

            <SectionTitle>Temperature</SectionTitle>
            <View className="flex-row flex-wrap">
              {LEAD_TEMPERATURES.map((t) => (
                <Chip
                  key={t.value}
                  selected={val('lead_temperature') === t.value}
                  disabled={busy}
                  onPress={() => apply({ lead_temperature: t.value })}
                >
                  <Text className="mr-1 text-xs">{t.emoji}</Text>
                  <Text
                    className={`text-xs font-medium ${
                      val('lead_temperature') === t.value ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    {t.label}
                  </Text>
                </Chip>
              ))}
            </View>

            <SectionTitle>Follow-up due date</SectionTitle>
            <View className="flex-row flex-wrap">
              {FOLLOW_UP_PRESETS.map((opt) => {
                const iso = isoDate(opt.days);
                const selected = (val('follow_up_date') ?? '')
                  .toString()
                  .startsWith(iso);
                return (
                  <Chip
                    key={opt.label}
                    selected={selected}
                    disabled={busy}
                    onPress={() => apply({ follow_up_date: iso })}
                  >
                    <Text
                      className={`text-xs font-medium ${selected ? 'text-white' : 'text-slate-700'}`}
                    >
                      {opt.label}
                    </Text>
                  </Chip>
                );
              })}
            </View>
            {val('follow_up_date') ? (
              <Text className="mt-1 text-xs text-purple-600">
                📅 Currently: {new Date(String(val('follow_up_date'))).toLocaleDateString()}
              </Text>
            ) : null}

            <SectionTitle>Next action</SectionTitle>
            <TextInput
              value={nextAction}
              onChangeText={setNextAction}
              placeholder="e.g. Share transport cost for Minjur site"
              placeholderTextColor="#94a3b8"
              multiline
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-ink"
            />
            <Pressable
              onPress={() => apply({ next_action: nextAction.trim() || null })}
              disabled={busy || nextAction.trim() === (String(val('next_action') ?? ''))}
              className={`mt-2 items-center rounded-xl py-2.5 ${
                busy || nextAction.trim() === (String(val('next_action') ?? ''))
                  ? 'bg-slate-200'
                  : 'bg-brand active:opacity-80'
              }`}
            >
              <Text className="text-sm font-semibold text-ink">Save next action</Text>
            </Pressable>
          </ScrollView>

          <View className="border-t border-slate-100 p-4">
            <Pressable
              onPress={onClose}
              className="items-center rounded-xl bg-ink py-3 active:opacity-80"
            >
              <Text className="font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
