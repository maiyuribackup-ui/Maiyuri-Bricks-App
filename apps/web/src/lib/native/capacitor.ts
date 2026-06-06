"use client";

/**
 * Native bridge helpers. The web app is served from Vercel and loaded inside
 * the Capacitor Android shell via server.url, so we DO NOT import any
 * @capacitor/* npm package here (that would couple the web build to native and
 * trip the workspace install). Instead we use the `window.Capacitor` bridge
 * the native runtime injects into the page. On web/desktop these are no-ops.
 */

import { getSupabase } from "@/lib/supabase";
import { useUIStore } from "@/stores/uiStore";

type AnyObj = Record<string, unknown> & { [k: string]: any };

function cap(): AnyObj | null {
  if (typeof window === "undefined") return null;
  return (window as any).Capacitor ?? null;
}

export function isNativeApp(): boolean {
  const c = cap();
  return !!(
    c &&
    typeof c.isNativePlatform === "function" &&
    c.isNativePlatform()
  );
}

// Listeners must be bound exactly once per app session — the dashboard layout
// re-runs the init effect on every user change / remount, and double-bound
// listeners would POST the token (and toast) twice per event.
let listenersBound = false;
// Records the last token we successfully persisted (FCM re-fires "registration"
// on every launch). Kept for on-device diagnostics — the backend upsert is
// idempotent, so re-posting the same token just refreshes its last_seen.
const REGISTERED_TOKEN_KEY = "mb.push.registeredToken";

/** Current Supabase access token, or null if not signed in. */
async function getAccessToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist the device token to the backend. Retries with exponential backoff:
 * the FCM token can arrive before the Supabase session is ready (→ 401) or
 * during a network blip, and a dropped token means this device silently never
 * receives a push. Attaches the session Bearer token because cookies are not
 * reliably present in the native webview.
 */
async function persistToken(
  token: string,
  platform: string,
  attempt = 0,
): Promise<void> {
  const MAX_ATTEMPTS = 6;
  try {
    const accessToken = await getAccessToken();
    const res = await fetch("/api/push/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ token, platform }),
    });
    if (res.ok) {
      try {
        localStorage.setItem(REGISTERED_TOKEN_KEY, token);
      } catch {
        /* private mode / storage disabled — non-fatal */
      }
      return;
    }
    throw new Error(`register failed: ${res.status}`);
  } catch (err) {
    if (attempt + 1 >= MAX_ATTEMPTS) {
      console.error("push token registration gave up:", err);
      return;
    }
    const delayMs = Math.min(2000 * 2 ** attempt, 30000);
    await new Promise((r) => setTimeout(r, delayMs));
    return persistToken(token, platform, attempt + 1);
  }
}

/**
 * Request notification permission, register with FCM, and POST the device
 * token to the backend. Wires notification taps to a navigation callback and
 * surfaces foreground pushes as in-app toasts (Android drops the system
 * notification while the app is open). Safe to call anywhere — returns
 * immediately unless running in the native app, and is idempotent.
 */
export async function initPushNotifications(
  onNavigate?: (url: string) => void,
): Promise<void> {
  if (!isNativeApp()) return;
  const Push = cap()?.Plugins?.PushNotifications;
  if (!Push) return;

  try {
    if (!listenersBound) {
      listenersBound = true;

      Push.addListener?.("registration", async (t: { value?: string }) => {
        const token = t?.value;
        if (!token) return;
        await persistToken(token, "android");
      });

      Push.addListener?.("registrationError", (e: unknown) =>
        console.error("push registrationError", e),
      );

      // Foreground receipt → Android suppresses the tray notification, so show
      // an in-app toast instead. Tapping a tray notification goes through the
      // actionPerformed listener below.
      Push.addListener?.(
        "pushNotificationReceived",
        (notif: {
          title?: string;
          body?: string;
          data?: Record<string, string>;
        }) => {
          try {
            useUIStore.getState().addToast({
              type: "info",
              title: notif?.title ?? "Maiyuri Bricks",
              message: notif?.body,
              duration: 6000,
            });
          } catch {
            /* store unavailable — non-fatal */
          }
        },
      );

      // Tap on a notification → deep-link to the screen it points at.
      Push.addListener?.(
        "pushNotificationActionPerformed",
        (action: { notification?: { data?: Record<string, string> } }) => {
          const url = action?.notification?.data?.url;
          if (url && onNavigate) onNavigate(url);
        },
      );
    }

    // High-importance channel so notifications appear as heads-up with sound.
    // Must match the channel_id the server sets on the FCM message.
    await Push.createChannel?.({
      id: "default",
      name: "General Notifications",
      description: "Lead alerts, reminders and updates",
      importance: 5,
      visibility: 1,
      sound: "default",
    }).catch(() => {
      /* createChannel is Android-only and best-effort */
    });

    const perm = await Push.requestPermissions?.();
    if (perm?.receive === "granted") {
      await Push.register?.();
    }
  } catch (e) {
    console.error("initPushNotifications failed", e);
  }
}
