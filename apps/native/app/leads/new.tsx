import { useRouter } from 'expo-router';
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
import { useCreateLead } from '@/hooks/use-leads';
import { isoDate, LEAD_TEMPERATURES } from '@/lib/lead-taxonomy';

// Same business vocabulary as the web form (apps/web/app/(dashboard)/leads/new).
const SOURCE_OPTIONS = [
  'Facebook',
  'Google',
  'Customer Reference',
  'Instagram',
  'Company Website',
  'Just Dial',
  'IndiaMart',
  'Walk-in',
  'Phone',
  'Other',
];

const LEAD_TYPE_OPTIONS = ['Commercial', 'Residential', 'Industrial', 'Government', 'Other'];

const FOLLOW_UP_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
];

function ChipRow<T extends string>({
  options,
  value,
  onSelect,
  render,
}: {
  options: readonly T[];
  value: T | null;
  onSelect: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <View className="flex-row flex-wrap">
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onSelect(opt)}
          className={`mb-1.5 mr-1.5 rounded-lg border px-3 py-1.5 ${
            value === opt ? 'border-ink bg-ink' : 'border-slate-200 bg-white'
          } active:opacity-70`}
        >
          <Text
            className={`text-xs font-medium ${value === opt ? 'text-white' : 'text-slate-700'}`}
          >
            {render ? render(opt) : opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text className="mb-1.5 mt-4 text-sm font-semibold text-ink">
      {children}
      {required ? <Text className="text-red-500"> *</Text> : null}
    </Text>
  );
}

export default function NewLeadScreen() {
  const router = useRouter();
  const createLead = useCreateLead();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [leadType, setLeadType] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string | null>('warm');
  const [siteLocation, setSiteLocation] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [nextAction, setNextAction] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    // Mirror createLeadSchema's required fields with friendly messages.
    if (!name.trim()) return setFormError('Name is required');
    if (contact.trim().replace(/[^0-9+]/g, '').length < 10)
      return setFormError('Valid contact number required (10+ digits)');
    if (!source) return setFormError('Select a source');
    if (!leadType) return setFormError('Select a lead type');

    const body: Record<string, unknown> = {
      name: name.trim(),
      contact: contact.trim(),
      source,
      lead_type: leadType,
      lead_temperature: temperature,
      site_location: siteLocation.trim() || null,
      next_action: nextAction.trim() || null,
      follow_up_date: followUpDays !== null ? isoDate(followUpDays) : null,
    };
    const value = Number(estimatedValue.replace(/[^0-9.]/g, ''));
    if (estimatedValue && !Number.isNaN(value) && value > 0) {
      body.estimated_value = value;
    }

    createLead.mutate(body, {
      onSuccess: (res) => {
        // Straight to the new lead so the rep can keep working it.
        router.replace(`/leads/${res.data.id}`);
      },
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerClassName="px-5 pb-10 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <Label required>Name</Label>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Customer name"
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
        />

        <Label required>Contact number</Label>
        <TextInput
          value={contact}
          onChangeText={setContact}
          keyboardType="phone-pad"
          placeholder="98xxxxxxxx"
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
        />

        <Label required>Source</Label>
        <ChipRow options={SOURCE_OPTIONS} value={source} onSelect={setSource} />

        <Label required>Lead type</Label>
        <ChipRow options={LEAD_TYPE_OPTIONS} value={leadType} onSelect={setLeadType} />

        <Label>Temperature</Label>
        <ChipRow
          options={LEAD_TEMPERATURES.map((t) => t.value)}
          value={temperature}
          onSelect={setTemperature}
          render={(v) => {
            const t = LEAD_TEMPERATURES.find((x) => x.value === v)!;
            return `${t.emoji} ${t.label}`;
          }}
        />

        <Label>Site location</Label>
        <TextInput
          value={siteLocation}
          onChangeText={setSiteLocation}
          placeholder="e.g. Minjur, Chennai"
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
        />

        <Label>Estimated value (₹)</Label>
        <TextInput
          value={estimatedValue}
          onChangeText={setEstimatedValue}
          keyboardType="numeric"
          placeholder="e.g. 250000"
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
        />

        <Label>Follow-up</Label>
        <View className="flex-row flex-wrap">
          {FOLLOW_UP_PRESETS.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() =>
                setFollowUpDays((d) => (d === opt.days ? null : opt.days))
              }
              className={`mb-1.5 mr-1.5 rounded-lg border px-3 py-1.5 ${
                followUpDays === opt.days ? 'border-ink bg-ink' : 'border-slate-200 bg-white'
              } active:opacity-70`}
            >
              <Text
                className={`text-xs font-medium ${
                  followUpDays === opt.days ? 'text-white' : 'text-slate-700'
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Label>Next action</Label>
        <TextInput
          value={nextAction}
          onChangeText={setNextAction}
          placeholder="e.g. Send brochure on WhatsApp"
          placeholderTextColor="#94a3b8"
          multiline
          className="min-h-[44px] rounded-xl border border-slate-200 bg-canvas px-4 py-2.5 text-ink"
        />

        {formError ? (
          <Text className="mt-3 text-sm text-red-500">{formError}</Text>
        ) : null}
        {createLead.isError ? (
          <Text className="mt-3 text-sm text-red-500">
            {createLead.error instanceof Error
              ? createLead.error.message
              : 'Failed to create lead'}
          </Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={createLead.isPending}
          className={`mt-6 items-center rounded-xl py-3.5 ${
            createLead.isPending ? 'bg-slate-200' : 'bg-brand active:opacity-80'
          }`}
        >
          {createLead.isPending ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text className="text-base font-semibold text-ink">Create lead</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
