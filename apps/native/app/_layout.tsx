import '../global.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  asyncStoragePersister,
  PERSIST_MAX_AGE,
  queryClient,
} from '@/lib/query-client';
import { initNotificationNavigation, registerForPush } from '@/lib/push';
import { initAuthListener, useAuth } from '@/store/auth';
import { initSentry, Sentry, setSentryUser } from '@/lib/sentry';
import { ToastHost } from '@/components/ToastHost';
import { OfflineBanner } from '@/components/OfflineBanner';
import { NavDrawer } from '@/ui/NavDrawer';
import { initOnlineManager } from '@/lib/offline';
import { checkForAppUpdate } from '@/lib/app-updates';

// Initialise crash reporting before the app tree renders (no-op without a DSN).
initSentry();
// Wire online/offline detection so offline writes queue instead of failing.
initOnlineManager();

function RootLayout() {
  const router = useRouter();
  const session = useAuth((s) => s.session);

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  // OTA update check on launch (no-op in dev / unconfigured builds).
  useEffect(() => {
    void checkForAppUpdate();
  }, []);

  // Attribute crashes to the signed-in user.
  useEffect(() => {
    setSentryUser(
      session?.user ? { id: session.user.id, email: session.user.email } : null,
    );
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister, maxAge: PERSIST_MAX_AGE }}
          onSuccess={() => {
            // Replay any offline writes that were queued before the app closed
            // (e.g. a driver's Mark Delivered from the brick yard).
            void queryClient.resumePausedMutations();
          }}
        >
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <OfflineBanner />
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
            {/* Native left navigation drawer (hamburger + left-edge swipe).
                Rendered above the Stack so it overlays every screen. */}
            {session ? <NavDrawer /> : null}
            <ToastHost />
          </BottomSheetModalProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs a top-level error boundary (auto-reports render
// crashes) and touch/navigation instrumentation.
export default Sentry.wrap(RootLayout);
