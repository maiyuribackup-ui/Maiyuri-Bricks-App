"use client";

/**
 * Native bridge helpers. The web app is served from Vercel and loaded inside
 * the Capacitor Android shell via server.url, so we DO NOT import any
 * @capacitor/* npm package here (that would couple the web build to native and
 * trip the workspace install). Instead we use the `window.Capacitor` bridge
 * the native runtime injects into the page. On web/desktop these are no-ops.
 */

type AnyObj = Record<string, unknown> & { [k: string]: any };

function cap(): AnyObj | null {
  if (typeof window === "undefined") return null;
  return (window as any).Capacitor ?? null;
}

export function isNativeApp(): boolean {
  const c = cap();
  return !!(c && typeof c.isNativePlatform === "function" && c.isNativePlatform());
}

/**
 * Request notification permission, register with FCM, and POST the device
 * token to the backend. Wires notification taps to a navigation callback.
 * Safe to call anywhere — returns immediately unless running in the native app.
 */
export async function initPushNotifications(
  onNavigate?: (url: string) => void,
): Promise<void> {
  if (!isNativeApp()) return;
  const Push = cap()?.Plugins?.PushNotifications;
  if (!Push) return;

  try {
    Push.addListener?.("registration", async (t: { value?: string }) => {
      const token = t?.value;
      if (!token) return;
      try {
        await fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform: "android" }),
        });
      } catch {
        /* best-effort; retried on next launch */
      }
    });

    Push.addListener?.("registrationError", (e: unknown) =>
      console.error("push registrationError", e),
    );

    // Tap on a notification → deep-link to the screen it points at.
    Push.addListener?.(
      "pushNotificationActionPerformed",
      (action: { notification?: { data?: Record<string, string> } }) => {
        const url = action?.notification?.data?.url;
        if (url && onNavigate) onNavigate(url);
      },
    );

    const perm = await Push.requestPermissions?.();
    if (perm?.receive === "granted") {
      await Push.register?.();
    }
  } catch (e) {
    console.error("initPushNotifications failed", e);
  }
}
