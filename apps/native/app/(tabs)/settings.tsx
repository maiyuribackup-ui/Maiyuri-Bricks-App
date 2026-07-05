import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useProductParams,
  useSaveProductParams,
} from '@/hooks/use-ops-planning';
import {
  useMyProfile,
  usePushStatus,
  useSendTestPush,
  useUpdatePrefs,
} from '@/hooks/use-push-settings';
import { registerForPush } from '@/lib/push';
import { useAuth } from '@/store/auth';

function PlanningParamsSection() {
  const { data, isLoading } = useProductParams();
  const save = useSaveProductParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [capacity, setCapacity] = useState('');
  const [curing, setCuring] = useState('');

  const startEdit = (row: {
    finished_good_id: string;
    daily_capacity_units: number | null;
    curing_days: number | null;
  }) => {
    setEditing(row.finished_good_id);
    setCapacity(row.daily_capacity_units != null ? String(row.daily_capacity_units) : '');
    setCuring(row.curing_days != null ? String(row.curing_days) : '7');
  };

  const commit = (finished_good_id: string) => {
    const cap = Number(capacity);
    const cure = Number(curing);
    if (Number.isNaN(cap) || cap < 0 || Number.isNaN(cure) || cure < 0) return;
    save.mutate(
      { finished_good_id, daily_capacity_units: cap, curing_days: cure },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-ink">🏭 Production planning</Text>
      <Text className="mt-0.5 text-xs text-slate-400">
        Daily capacity (units/day) and curing days per product — the planner's
        hard limits.
      </Text>
      {isLoading ? (
        <ActivityIndicator className="mt-3" color="#f97316" />
      ) : (
        (data?.data ?? []).map((row) => (
          <View key={row.finished_good_id} className="mt-3 border-t border-slate-100 pt-2.5">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-sm font-medium text-ink" numberOfLines={1}>
                {row.product_name}
              </Text>
              {editing === row.finished_good_id ? null : (
                <Pressable
                  onPress={() => startEdit(row)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 active:opacity-70"
                >
                  <Text className="text-xs font-semibold text-slate-600">Edit</Text>
                </Pressable>
              )}
            </View>
            {editing === row.finished_good_id ? (
              <View className="mt-2 flex-row items-center gap-2">
                <TextInput
                  value={capacity}
                  onChangeText={setCapacity}
                  keyboardType="numeric"
                  placeholder="units/day"
                  placeholderTextColor="#94a3b8"
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-ink"
                />
                <TextInput
                  value={curing}
                  onChangeText={setCuring}
                  keyboardType="numeric"
                  placeholder="cure d"
                  placeholderTextColor="#94a3b8"
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-ink"
                />
                <Pressable
                  onPress={() => commit(row.finished_good_id)}
                  disabled={save.isPending}
                  className={`rounded-lg px-3 py-1.5 ${save.isPending ? 'bg-slate-200' : 'bg-brand active:opacity-80'}`}
                >
                  {save.isPending ? (
                    <ActivityIndicator size="small" color="#0f172a" />
                  ) : (
                    <Text className="text-xs font-semibold text-ink">Save</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Text className="mt-0.5 text-xs text-slate-500">
                {row.daily_capacity_units != null
                  ? `${Number(row.daily_capacity_units).toLocaleString('en-IN')}/day · cure ${row.curing_days}d`
                  : '⚠️ not set — excluded from planning'}
                {row.stock_qty != null
                  ? ` · stock ${Number(row.stock_qty).toLocaleString('en-IN')}`
                  : ''}
              </Text>
            )}
          </View>
        ))
      )}
      {save.isError ? (
        <Text className="mt-2 text-xs text-red-500">
          {save.error instanceof Error ? save.error.message : 'Save failed'}
        </Text>
      ) : null}
    </View>
  );
}

const PREF_ROWS: { key: string; label: string; hint: string }[] = [
  { key: 'push_leads', label: '🆕 Lead alerts', hint: 'New/assigned leads, updates, order won' },
  { key: 'push_ops', label: '🚚 Ops alerts', hint: 'Deliveries today, production approvals' },
  { key: 'push_digest', label: '📅 Morning digest', hint: 'Daily follow-up summary at ~8:30' },
];

function PushSection() {
  const status = usePushStatus();
  const test = useSendTestPush();
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<string | null>(null);

  const onRegister = async () => {
    setRegistering(true);
    setRegisterResult(null);
    const ok = await registerForPush();
    setRegisterResult(
      ok
        ? '✅ Device registered for notifications'
        : '⚠️ Could not register (Expo Go build, permission denied, or offline)',
    );
    setRegistering(false);
    void status.refetch();
  };

  return (
    <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-ink">🔔 Push notifications</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {status.isLoading
          ? 'Checking…'
          : status.data?.data.configured
            ? `Server ready · ${status.data.data.deviceCount} device${status.data.data.deviceCount === 1 ? '' : 's'} registered`
            : 'Server not configured for push'}
      </Text>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={onRegister}
          disabled={registering}
          className="flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 py-2.5 active:opacity-70"
        >
          {registering ? (
            <ActivityIndicator size="small" color="#f97316" />
          ) : (
            <Text className="text-sm font-semibold text-ink">Register device</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => test.mutate()}
          disabled={test.isPending}
          className="flex-1 items-center rounded-lg bg-brand py-2.5 active:opacity-80"
        >
          {test.isPending ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text className="text-sm font-semibold text-ink">Send test push</Text>
          )}
        </Pressable>
      </View>

      {registerResult ? (
        <Text className="mt-2 text-xs text-slate-500">{registerResult}</Text>
      ) : null}
      {test.isSuccess ? (
        <Text className="mt-2 text-xs text-slate-500">
          {test.data.data.sent > 0
            ? `✅ Test sent to ${test.data.data.sent} device(s) — check your tray`
            : '⚠️ No delivery — register this device first (requires the installed APK, not Expo Go)'}
        </Text>
      ) : null}
      {test.isError ? (
        <Text className="mt-2 text-xs text-red-500">
          {test.error instanceof Error ? test.error.message : 'Test failed'}
        </Text>
      ) : null}
    </View>
  );
}

function PreferencesSection({ userId }: { userId: string }) {
  const profile = useMyProfile(userId);
  const update = useUpdatePrefs(userId);
  const prefs = (profile.data?.data.notification_preferences ?? {}) as Record<
    string,
    boolean
  >;

  const toggle = (key: string, value: boolean) => {
    update.mutate({ ...prefs, [key]: value });
  };

  return (
    <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold text-ink">Notification types</Text>
        {update.isPending ? <ActivityIndicator size="small" color="#f97316" /> : null}
      </View>
      {profile.isLoading ? (
        <ActivityIndicator className="mt-3" color="#f97316" />
      ) : (
        PREF_ROWS.map((row) => (
          <View
            key={row.key}
            className="mt-3 flex-row items-center justify-between"
          >
            <View className="min-w-0 flex-1 pr-3">
              <Text className="text-sm font-medium text-ink">{row.label}</Text>
              <Text className="text-xs text-slate-400">{row.hint}</Text>
            </View>
            <Switch
              value={prefs[row.key] !== false}
              onValueChange={(v) => toggle(row.key, v)}
              trackColor={{ true: '#f97316', false: '#cbd5e1' }}
              thumbColor="#ffffff"
            />
          </View>
        ))
      )}
      {update.isError ? (
        <Text className="mt-2 text-xs text-red-500">
          {update.error instanceof Error ? update.error.message : 'Save failed'}
        </Text>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? 'Unknown';
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView contentContainerClassName="px-4 pb-8 pt-4">
        <View className="rounded-xl border border-slate-200 bg-white p-4">
          <Text className="text-sm text-slate-500">Signed in as</Text>
          <Text className="mt-1 text-base font-semibold text-ink">{email}</Text>
          {profile.data?.data.role ? (
            <Text className="mt-0.5 text-sm capitalize text-slate-500">
              Role: {String(profile.data.data.role).replaceAll('_', ' ')}
            </Text>
          ) : null}
        </View>

        <PushSection />
        {userId ? <PreferencesSection userId={userId} /> : null}
        <PlanningParamsSection />

        <Pressable
          onPress={signOut}
          className="mt-6 items-center rounded-xl border border-red-200 bg-white py-3.5 active:opacity-70"
        >
          <Text className="text-base font-semibold text-red-500">Sign out</Text>
        </Pressable>

        <Text className="mt-8 text-center text-xs text-slate-400">
          Maiyuri Bricks · Native (Expo) · v0.1.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
