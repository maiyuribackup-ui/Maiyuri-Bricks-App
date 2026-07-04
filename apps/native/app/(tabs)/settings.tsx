import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? 'Unknown';

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 px-4 pt-4">
      <View className="rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-sm text-slate-500">Signed in as</Text>
        <Text className="mt-1 text-base font-semibold text-ink">{email}</Text>
      </View>

      <Pressable
        onPress={signOut}
        className="mt-6 items-center rounded-xl border border-red-200 bg-white py-3.5 active:opacity-70"
      >
        <Text className="text-base font-semibold text-red-500">Sign out</Text>
      </Pressable>

      <Text className="mt-8 text-center text-xs text-slate-400">
        Maiyuri Bricks · Native (Expo) · v0.1.0
      </Text>
    </SafeAreaView>
  );
}
