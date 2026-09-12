import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/store/auth';

/**
 * Entry gate: wait for the initial session check, then route to the app or login.
 */
export default function Index() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-ink">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
}
