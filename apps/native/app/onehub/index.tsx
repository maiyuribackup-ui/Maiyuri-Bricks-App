import { Link } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import {
  TICKET_APPROVER_ROLES,
  WORK_ADMIN_ROLES,
  useMyRole,
} from '@/hooks/use-approvals';
import { useSops } from '@/hooks/use-onehub';

export const DEPARTMENTS: { key: string; label: string; ta: string; icon: string }[] = [
  { key: 'sales', label: 'Sales', ta: 'விற்பனை', icon: '🤝' },
  { key: 'production', label: 'Production', ta: 'உற்பத்தி', icon: '🏭' },
  { key: 'dispatch', label: 'Dispatch', ta: 'டெலிவரி', icon: '🚚' },
  { key: 'accounts', label: 'Accounts & Odoo', ta: 'கணக்கு', icon: '💰' },
  { key: 'hr', label: 'HR / Admin', ta: 'நிர்வாகம்', icon: '👥' },
  { key: 'safety', label: 'Safety', ta: 'பாதுகாப்பு', icon: '🦺' },
];

export default function OneHubHome() {
  const { data } = useSops();
  const role = useMyRole();
  const showApprovals =
    TICKET_APPROVER_ROLES.includes(role) || WORK_ADMIN_ROLES.includes(role);
  const counts = new Map<string, number>();
  for (const sop of data?.data ?? []) {
    counts.set(sop.department, (counts.get(sop.department) ?? 0) + 1);
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 pb-10">
      {/* brand promise */}
      <View className="flex-row items-center overflow-hidden rounded-2xl bg-ink p-5">
        <View className="flex-1 pr-2">
          <Text className="text-lg font-bold text-white">Vanakkam! 👋</Text>
          <Text className="mt-2 text-2xl font-bold text-brand">
            நம் மண். நம் வீடு. நம் அறிவு.
          </Text>
          <Text className="mt-1 text-sm text-slate-300">
            Our soil. Our home. Our wisdom. — One place for SOPs, checklists,
            links and answers.
          </Text>
        </View>
        <Image
          source={require('../../assets/onehub/mayur-hero.png')}
          style={{ width: 96, height: 96 }}
          resizeMode="contain"
        />
      </View>

      {/* My Work — the personal daily queue */}
      <Link href={"/onehub/my-work" as import("expo-router").Href} asChild>
        <Pressable className="mt-3 flex-row items-center rounded-2xl bg-ink p-4 active:opacity-70">
          <Text className="mr-3 text-3xl">✅</Text>
          <View className="flex-1">
            <Text className="text-base font-bold text-white">My Work</Text>
            <Text className="text-xs text-slate-300">
              Your tasks, checklists and daily jobs — do them here
            </Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </Pressable>
      </Link>

      {/* Approvals — supervisors / accountants / founders */}
      {showApprovals ? (
        <Link href={"/onehub/approvals" as import("expo-router").Href} asChild>
          <Pressable className="mt-3 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:opacity-70">
            <Text className="mr-3 text-3xl">👀</Text>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">Approvals</Text>
              <Text className="text-xs text-slate-500">
                Tickets and work submissions waiting on your decision
              </Text>
            </View>
            <Text className="text-slate-400">→</Text>
          </Pressable>
        </Link>
      ) : null}

      {/* Ask Mayur */}
      <Link href={"/onehub/ask" as import("expo-router").Href} asChild>
        <Pressable className="mt-3 flex-row items-center rounded-2xl border-2 border-brand bg-orange-50 p-4 active:opacity-70">
          <Image
            source={require('../../assets/onehub/mayur-avatar.png')}
            style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }}
            resizeMode="cover"
          />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">Ask Mayur</Text>
            <Text className="text-xs text-slate-500">
              Any question about products, process, SOPs — English or தமிழ்
            </Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </Pressable>
      </Link>

      {/* SOP library */}
      <Text className="mb-2 mt-5 text-base font-bold text-ink">📖 SOP Library</Text>
      <View className="flex-row flex-wrap justify-between">
        {DEPARTMENTS.map((d) => (
          <Link key={d.key} href={`/onehub/department/${d.key}` as import("expo-router").Href} asChild>
            <Pressable className="mb-3 w-[48.5%] rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
              <Text className="text-2xl">{d.icon}</Text>
              <Text className="mt-1 text-sm font-semibold text-ink">{d.label}</Text>
              <Text className="text-xs text-slate-400">
                {d.ta} · {counts.get(d.key) ?? 0} SOP{(counts.get(d.key) ?? 0) === 1 ? '' : 's'}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>

      {/* other sections */}
      <Link href={"/onehub/checklists" as import("expo-router").Href} asChild>
        <Pressable className="mb-3 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
          <Text className="mr-3 text-2xl">✅</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink">New Joiners Checklist</Text>
            <Text className="text-xs text-slate-400">Onboarding steps, owners, progress</Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </Pressable>
      </Link>
      <Link href={"/onehub/training" as import("expo-router").Href} asChild>
        <Pressable className="mb-3 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
          <Text className="mr-3 text-2xl">🎓</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink">Training</Text>
            <Text className="text-xs text-slate-400">
              Product & sales lessons — learn at your own pace
            </Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </Pressable>
      </Link>
      <Link href={"/onehub/links" as import("expo-router").Href} asChild>
        <Pressable className="mb-3 flex-row items-center rounded-xl border border-slate-200 bg-white p-4 active:opacity-70">
          <Text className="mr-3 text-2xl">🔗</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink">Important Links</Text>
            <Text className="text-xs text-slate-400">Odoo, brochure, calculator, socials</Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
