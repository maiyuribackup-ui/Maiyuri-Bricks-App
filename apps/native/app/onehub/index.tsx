import { useRouter } from 'expo-router';
import { Image, ScrollView, Text, View } from 'react-native';
import {
  TICKET_APPROVER_ROLES,
  WORK_ADMIN_ROLES,
  useMyRole,
} from '@/hooks/use-approvals';
import { DAILY_REPORT_ROLES } from '@/hooks/use-daily-report';
import {
  EXPENSE_ADMIN_ROLES,
  EXPENSE_SUBMITTER_ROLES,
} from '@/hooks/use-expenses';
import { useSops } from '@/hooks/use-onehub';
import { Card, Icon, type IconName, Touchable } from '@/ui';

export const DEPARTMENTS: {
  key: string;
  label: string;
  ta: string;
  icon: IconName;
  tint: string;
}[] = [
  { key: 'sales', label: 'Sales', ta: 'விற்பனை', icon: 'people-outline', tint: '#f97316' },
  { key: 'production', label: 'Production', ta: 'உற்பத்தி', icon: 'construct-outline', tint: '#0ea5e9' },
  { key: 'dispatch', label: 'Dispatch', ta: 'டெலிவரி', icon: 'cube-outline', tint: '#8b5cf6' },
  { key: 'accounts', label: 'Accounts', ta: 'கணக்கு', icon: 'cash-outline', tint: '#16a34a' },
  { key: 'hr', label: 'HR / Admin', ta: 'நிர்வாகம்', icon: 'people-circle-outline', tint: '#e11d48' },
  { key: 'safety', label: 'Safety', ta: 'பாதுகாப்பு', icon: 'shield-checkmark-outline', tint: '#d97706' },
];

/** A big tappable navigation row with a tinted icon chip. */
function NavRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  accent,
}: {
  icon: IconName;
  tint: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Touchable onPress={onPress} className="mb-3">
      <Card className={`flex-row items-center ${accent ? 'bg-ink' : ''}`}>
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: accent ? 'rgba(255,255,255,0.12)' : `${tint}1a` }}
        >
          <Icon name={icon} size={24} color={accent ? '#f97316' : tint} />
        </View>
        <View className="flex-1">
          <Text className={`text-base font-bold ${accent ? 'text-white' : 'text-ink'}`}>
            {title}
          </Text>
          <Text className={`mt-0.5 text-sm ${accent ? 'text-slate-300' : 'text-muted'}`}>
            {subtitle}
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color={accent ? '#64748b' : '#cbd5e1'} />
      </Card>
    </Touchable>
  );
}

export default function OneHubHome() {
  const router = useRouter();
  const { data } = useSops();
  const role = useMyRole();
  const showApprovals =
    TICKET_APPROVER_ROLES.includes(role) || WORK_ADMIN_ROLES.includes(role);
  const showExpenses =
    EXPENSE_SUBMITTER_ROLES.includes(role) || EXPENSE_ADMIN_ROLES.includes(role);
  const showDailyReport = DAILY_REPORT_ROLES.includes(role);
  const counts = new Map<string, number>();
  for (const sop of data?.data ?? []) {
    counts.set(sop.department, (counts.get(sop.department) ?? 0) + 1);
  }
  const go = (href: string) => router.push(href as never);

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-12">
      {/* Brand promise */}
      <View className="mb-4 flex-row items-center overflow-hidden rounded-3xl bg-ink p-6">
        <View className="flex-1 pr-2">
          <Text className="text-lg font-bold text-white">Vanakkam! 👋</Text>
          <Text className="mt-2 text-2xl font-bold text-brand">
            நம் மண். நம் வீடு. நம் அறிவு.
          </Text>
          <Text className="mt-2 text-sm leading-6 text-slate-300">
            Our soil. Our home. Our wisdom.
          </Text>
        </View>
        <Image
          source={require('../../assets/onehub/mayur-hero.png')}
          style={{ width: 92, height: 92 }}
          resizeMode="contain"
        />
      </View>

      <NavRow
        accent
        icon="checkbox-outline"
        tint="#f97316"
        title="My Work"
        subtitle="Your tasks, checklists and daily jobs"
        onPress={() => go('/onehub/my-work')}
      />

      {showExpenses ? (
        <NavRow
          icon="wallet-outline"
          tint="#16a34a"
          title="My Expenses"
          subtitle="Petty-cash balance — petrol, materials & more"
          onPress={() => go('/onehub/expenses')}
        />
      ) : null}

      {showApprovals ? (
        <NavRow
          icon="checkmark-done-outline"
          tint="#8b5cf6"
          title="Approvals"
          subtitle="Tickets, work & expenses awaiting you"
          onPress={() => go('/onehub/approvals')}
        />
      ) : null}

      {showDailyReport ? (
        <NavRow
          icon="stats-chart-outline"
          tint="#0ea5e9"
          title="Daily Report"
          subtitle="Finance, receivables, production — export PDF"
          onPress={() => go('/onehub/daily-report')}
        />
      ) : null}

      {/* Ask Mayur — keep the avatar, it's brand */}
      <Touchable onPress={() => go('/onehub/ask')} className="mb-3">
        <View className="flex-row items-center rounded-2xl border-2 border-brand bg-orange-50 p-4">
          <Image
            source={require('../../assets/onehub/mayur-avatar.png')}
            style={{ width: 46, height: 46, borderRadius: 23, marginRight: 14 }}
            resizeMode="cover"
          />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">Ask Mayur</Text>
            <Text className="mt-0.5 text-sm text-muted">
              Any question — products, process, SOPs (EN / தமிழ்)
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color="#cbd5e1" />
        </View>
      </Touchable>

      {/* SOP library */}
      <Text className="mb-3 mt-5 text-lg font-bold text-ink">SOP Library</Text>
      <View className="flex-row flex-wrap justify-between">
        {DEPARTMENTS.map((d) => (
          <Touchable
            key={d.key}
            onPress={() => go(`/onehub/department/${d.key}`)}
            className="mb-3 w-[48.5%]"
          >
            <Card>
              <View
                className="mb-3 h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${d.tint}1a` }}
              >
                <Icon name={d.icon} size={22} color={d.tint} />
              </View>
              <Text className="text-base font-semibold text-ink">{d.label}</Text>
              <Text className="mt-0.5 text-sm text-subtle">
                {d.ta} · {counts.get(d.key) ?? 0} SOP
                {(counts.get(d.key) ?? 0) === 1 ? '' : 's'}
              </Text>
            </Card>
          </Touchable>
        ))}
      </View>

      <View className="mt-2">
        <NavRow
          icon="school-outline"
          tint="#0ea5e9"
          title="Training"
          subtitle="Product & sales lessons — at your own pace"
          onPress={() => go('/onehub/training')}
        />
        <NavRow
          icon="people-outline"
          tint="#e11d48"
          title="New Joiners Checklist"
          subtitle="Onboarding steps, owners, progress"
          onPress={() => go('/onehub/checklists')}
        />
        <NavRow
          icon="link-outline"
          tint="#64748b"
          title="Important Links"
          subtitle="Odoo, brochure, calculator, socials"
          onPress={() => go('/onehub/links')}
        />
      </View>
    </ScrollView>
  );
}
