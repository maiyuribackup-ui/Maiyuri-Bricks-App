import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/lib/query-client';
import { initNotificationNavigation, registerForPush } from '@/lib/push';
import { initAuthListener, useAuth } from '@/store/auth';

export default function RootLayout() {
  const router = useRouter();
  const session = useAuth((s) => s.session);

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  // Notification tap → in-app navigation (data.url is an expo-router path).
  useEffect(() => {
    return initNotificationNavigation((url) => {
      router.push(url as never);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register this device for push once a user is signed in (and again on
  // every sign-in — the backend upserts by token and reassigns ownership).
  useEffect(() => {
    if (session) void registerForPush();
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="leads/[id]"
            options={{ headerShown: true, title: 'Lead' }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
