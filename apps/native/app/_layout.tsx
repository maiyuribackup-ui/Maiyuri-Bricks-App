import '../global.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  asyncStoragePersister,
  PERSIST_MAX_AGE,
  queryClient,
} from '@/lib/query-client';
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
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister, maxAge: PERSIST_MAX_AGE }}
      >
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="leads/[id]"
            options={{ headerShown: true, title: 'Lead' }}
          />
          <Stack.Screen
            name="leads/new"
            options={{ headerShown: true, title: 'New Lead' }}
          />
          <Stack.Screen name="onehub" options={{ headerShown: false }} />
        </Stack>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
