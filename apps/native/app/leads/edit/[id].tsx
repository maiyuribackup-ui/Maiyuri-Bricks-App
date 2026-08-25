import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
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
import { useLead, useUpdateLead } from '@/hooks/use-leads';
import { LEAD_TEMPERATURES } from '@/lib/lead-taxonomy';
import { toast } from '@/lib/toast';

/**
 * Edit a lead — the whole record, not just its status.
 *
 * The header's Edit button used to open the Quick Actions sheet, which only
 * offers status, stage, temperature, follow-up date and next action. So anyone
 * trying to correct a customer's name, phone or site address tapped Edit,
 * found no field for it, and reasonably concluded that Edit was broken.
 *
 * This is a plain screen with plain inputs: no bottom sheet, no gestures,
 * nothing that can fail to present. Quick Actions still exists on the leads
 * list, where fast triage is the point.
 */

const CLASSIFICATIONS = [
  'direct_customer',
  'vendor',
  'builder',
  'dealer',
  'architect',
];

const STATUSES = [
  'new_contact_pending',
  'contact_attempted',
  'connected',
  'follow_up_scheduled',
  'waiting_for_customer',
  'nurture_later',
  'closed',
];

const STAGES = [
  'new_inquiry',
  'qualified_lead',
  'quote_shared',
  'factory_visit_proof',
  'decision_pending',
  'finalisation',
  'order_won',
  'closed_lost',
];

const pretty = (v: string) => v.replaceAll('_', ' ');

function Label({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

function Chips({
  options,
  value,
  onSelect,
  render,
}: {
  options: string[];
  value: string | null;
  onSelect: (v: string) => void;
  render?: (v: string) => string;
}) {
  return (
    <View className="flex-row flex-wrap">
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onSelect(opt)}
          className={`mb-1.5 mr-1.5 rounded-lg border px-3 py-1.5 ${
            value === opt ? 'border-ink bg-ink' : 'border-slate-200 bg-white'
          }`}
        >
          <Text
            className={`text-sm capitalize ${
              value === opt ? 'font-semibold text-white' : 'text-slate-600'
            }`}
          >
            {render ? render(opt) : pretty(opt)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function EditLeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useLead(id);
  const update = useUpdateLead();
  const lead = data?.data;

  // Populated once the lead arrives; `loadedFor` keeps it from clobbering
  // edits in progress on every refetch.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [siteLocation, setSiteLocation] = useState('');
  const [area, setArea] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string | null>(null);
  const [classification, setClassification] = useState<string | null>(null);

  if (lead && lead.id !== loadedFor) {
    setLoadedFor(lead.id);
    setName(lead.name ?? '');
    setContact(lead.contact ?? '');
    setSiteLocation(lead.site_location ?? '');
    setArea(lead.area ?? '');
    setEstimatedValue(
      lead.estimated_value != null ? String(lead.estimated_value) : '',
    );
    setNextAction(lead.next_action ?? '');
    setStaffNotes(lead.staff_notes ?? '');
    setStatus(lead.lead_status ?? null);
    setStage(lead.pipeline_stage ?? null);
    setTemperature(lead.lead_temperature ?? null);
    setClassification(lead.classification ?? null);
  }

  function save() {
    if (!lead) return;
    if (!name.trim()) return toast.error('Name cannot be empty');
    if (!contact.trim()) return toast.error('Contact number cannot be empty');

    update.mutate(
      {
        id: lead.id,
        body: {
          name: name.trim(),
          contact: contact.trim(),
          site_location: siteLocation.trim() || null,
          area: area.trim() || null,
          estimated_value: estimatedValue ? Number(estimatedValue) : null,
          next_action: nextAction.trim() || null,
          staff_notes: staffNotes.trim() || null,
          ...(status ? { lead_status: status } : {}),
          ...(stage ? { pipeline_stage: stage } : {}),
          ...(temperature ? { lead_temperature: temperature } : {}),
          ...(classification ? { classification } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success('Lead updated');
          router.back();
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Could not save'),
      },
    );
  }

  if (isLoading || !lead) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit lead' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-white"
      >
        <ScrollView
          contentContainerClassName="px-5 pb-10 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          <Label>Name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer name"
            placeholderTextColor="#94a3b8"
            className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          <Label>Contact number</Label>
          <TextInput
            value={contact}
            onChangeText={setContact}
            keyboardType="phone-pad"
            placeholder="98xxxxxxxx"
            placeholderTextColor="#94a3b8"
            className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          <Label>Site address</Label>
          <TextInput
            value={siteLocation}
            onChangeText={setSiteLocation}
            multiline
            placeholder="Full address"
            placeholderTextColor="#94a3b8"
            textAlignVertical="top"
            className="min-h-[64px] rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          {/* The quotation header prints this short form, not the full address. */}
          <Label>Locality (short, prints on the quote)</Label>
          <TextInput
            value={area}
            onChangeText={setArea}
            placeholder="e.g. Kotturpuram"
            placeholderTextColor="#94a3b8"
            className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          <Label>Classification</Label>
          <Chips
            options={CLASSIFICATIONS}
            value={classification}
            onSelect={setClassification}
          />

          <Label>Status</Label>
          <Chips options={STATUSES} value={status} onSelect={setStatus} />

          <Label>Pipeline stage</Label>
          <Chips options={STAGES} value={stage} onSelect={setStage} />

          <Label>Temperature</Label>
          <Chips
            options={LEAD_TEMPERATURES.map((t) => t.value)}
            value={temperature}
            onSelect={setTemperature}
            render={(v) => {
              const t = LEAD_TEMPERATURES.find((x) => x.value === v);
              return t ? `${t.emoji} ${t.label}` : v;
            }}
          />

          <Label>Estimated value (₹)</Label>
          <TextInput
            value={estimatedValue}
            onChangeText={(v) => setEstimatedValue(v.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="e.g. 250000"
            placeholderTextColor="#94a3b8"
            className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          <Label>Next action</Label>
          <TextInput
            value={nextAction}
            onChangeText={setNextAction}
            placeholder="e.g. Share transport cost"
            placeholderTextColor="#94a3b8"
            className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          <Label>Staff notes</Label>
          <TextInput
            value={staffNotes}
            onChangeText={setStaffNotes}
            multiline
            placeholder="Internal notes — the customer never sees these"
            placeholderTextColor="#94a3b8"
            textAlignVertical="top"
            className="min-h-[80px] rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
          />

          <Pressable
            disabled={update.isPending}
            onPress={save}
            className={`mt-6 items-center rounded-xl py-3.5 ${
              update.isPending ? 'bg-slate-200' : 'bg-brand active:opacity-80'
            }`}
          >
            <Text className="text-base font-bold text-ink">
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            className="mt-2 items-center py-3 active:opacity-70"
          >
            <Text className="text-sm font-medium text-slate-500">Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
