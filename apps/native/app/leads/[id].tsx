import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLead } from '@/hooks/use-leads';

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View className="border-b border-slate-100 py-3">
      <Text className="text-xs uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="mt-1 text-base text-ink">{String(value)}</Text>
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
    <ScrollView className="flex-1 bg-white">
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

      <View className="h-10" />
    </ScrollView>
  );
}
