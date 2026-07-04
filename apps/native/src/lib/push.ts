/**
 * Push notification engine (client side).
 *
 * Reuses the production backend end-to-end:
 *   - token registration:  POST /api/push/register { token, platform }
 *   - sender:              apps/web/src/lib/push/fcm.ts (FCM HTTP v1)
 *   - payload convention:  notification {title, body} + data.url = in-app path
 *     (e.g. "/leads/123") which maps 1:1 onto our expo-router routes.
 *
 * Remote push requires a real build (google-services.json baked in) — it does
 * NOT work inside Expo Go on Android. Every entry point here degrades
 * gracefully so Expo Go development keeps working.
 */
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/lib/api';

// Foreground presentation: show the banner + play sound even when the app is
// open (default Android behaviour is to silently swallow foreground pushes).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Matches the backend's android.notification.channel_id ("default"). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#f97316',
  });
}

/**
 * Ask permission, fetch the native FCM device token, and register it with the
 * backend. Safe to call on every app start / login: the backend upserts by
 * token and bumps last_seen_at. Returns true when a token was registered.
 */
export async function registerForPush(): Promise<boolean> {
  try {
    if (!Device.isDevice) return false; // emulators without Play services

    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return false;

    // Native FCM registration token — exactly what the backend's FCM v1
    // sender expects in device_tokens. Throws inside Expo Go (no Firebase
    // config), which the catch below turns into a silent no-op.
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) return false;

    // Registration with small retry — first launch often races flaky mobile
    // networks, and an unregistered device means missed business events.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await api.post('/api/push/register', {
          token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        });
        return true;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    return false;
  } catch (err) {
    console.log('[push] registration skipped:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Wire notification taps to in-app navigation. `navigate` receives the
 * backend's data.url path (e.g. "/leads/abc"). Also handles the cold-start
 * case where the tap launched the app. Returns an unsubscribe function.
 */
export function initNotificationNavigation(
  navigate: (url: string) => void,
): () => void {
  const extractUrl = (response: Notifications.NotificationResponse): string | null => {
    const data = response.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    const url = data?.url;
    return typeof url === 'string' && url.startsWith('/') ? url : null;
  };

  // App launched (cold start) by tapping a notification.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      const url = extractUrl(response);
      if (url) navigate(url);
    }
  });

  // App running (foreground/background) when the user taps.
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = extractUrl(response);
    if (url) navigate(url);
  });

  return () => sub.remove();
}
