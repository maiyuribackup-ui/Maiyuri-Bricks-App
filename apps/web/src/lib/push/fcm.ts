/**
 * Firebase Cloud Messaging (FCM HTTP v1) sender.
 *
 * Auth uses the Firebase Admin service account (FCM_SERVICE_ACCOUNT_JSON) via a
 * JWT → OAuth access token, mirroring the GA4 service-account pattern. Degrades
 * gracefully: no-op when the env isn't configured, so callers never crash.
 *
 * Server-only (reads a secret) — import from API routes / server libs only.
 */
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase-admin";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export function isFcmConfigured(): boolean {
  return Boolean(
    process.env.FCM_SERVICE_ACCOUNT_JSON && process.env.FCM_PROJECT_ID,
  );
}

async function getAccessToken(): Promise<string | null> {
  if (!isFcmConfigured()) return null;
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON!);
  } catch {
    console.error("FCM_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
  if (!creds.client_email || !creds.private_key) return null;
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, "\n"),
    scopes: [FCM_SCOPE],
  });
  const { access_token } = await jwt.authorize();
  return access_token ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Optional deep-link path (e.g. "/leads/123") + arbitrary string data. */
  data?: Record<string, string>;
}

/** Send to one device token. Returns false on a permanent failure (stale token). */
async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; stale: boolean }> {
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data ?? {},
            // channel_id must match the channel the native app creates (see
            // initPushNotifications) so Android 8+ shows a high-importance,
            // sound-enabled heads-up notification rather than a silent one.
            android: {
              priority: "high",
              notification: { sound: "default", channel_id: "default" },
            },
          },
        }),
      },
    );
    if (res.ok) return { ok: true, stale: false };
    // 404 UNREGISTERED / 400 INVALID_ARGUMENT on a bad token → prune it.
    const stale = res.status === 404 || res.status === 400;
    const txt = await res.text().catch(() => "");
    console.error(`FCM send failed (${res.status}): ${txt.slice(0, 200)}`);
    return { ok: false, stale };
  } catch (e) {
    console.error("FCM send error:", e);
    return { ok: false, stale: false };
  }
}

/**
 * Send a push to every device registered across a set of users. Mints ONE
 * OAuth access token and reuses it for all sends. Prunes stale tokens in a
 * single bulk delete. Safe to call from any server flow.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0 || !isFcmConfigured())
    return { sent: 0, failed: 0 };

  const accessToken = await getAccessToken();
  if (!accessToken) return { sent: 0, failed: 0 };
  const projectId = process.env.FCM_PROJECT_ID!;

  const { data: tokens } = await supabaseAdmin
    .from("device_tokens")
    .select("token")
    .in("user_id", uniqueUserIds);
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];
  for (const { token } of tokens) {
    const r = await sendToToken(accessToken, projectId, token, payload);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.stale) stale.push(token);
    }
  }
  if (stale.length > 0) {
    await supabaseAdmin.from("device_tokens").delete().in("token", stale);
  }
  return { sent, failed };
}

/**
 * Send a push to every device a user has registered. Prunes tokens FCM
 * reports as unregistered. Safe to call from any server flow.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!userId) return { sent: 0, failed: 0 };
  return sendPushToUsers([userId], payload);
}

/**
 * Convenience wrapper for lead-related pushes: centralizes the `/leads/[id]`
 * deep-link convention and the best-effort (swallow + log) discipline every
 * lead trigger needs, so call sites only decide recipients + copy. Never
 * throws — safe to await inline in a request handler.
 */
export async function notifyLeadPush(
  recipientIds: string[],
  opts: { title: string; body: string; leadId: string },
): Promise<void> {
  if (!recipientIds.length || !opts.leadId) return;
  try {
    await sendPushToUsers(recipientIds, {
      title: opts.title,
      body: opts.body,
      data: { url: `/leads/${opts.leadId}` },
    });
  } catch (err) {
    console.error("notifyLeadPush failed:", err);
  }
}

/** Per-category push opt-out keys stored in users.notification_preferences. */
export type PushPrefKey = "push_leads" | "push_ops" | "push_digest";

/**
 * Lean-notification policy: drop recipients who explicitly disabled this
 * push category. Absent key = opted in (default true), so existing users
 * keep receiving pushes without a migration. Fails open on query errors —
 * a broken prefs lookup must never silence business notifications.
 */
export async function filterByPushPref(
  userIds: string[],
  pref: PushPrefKey,
): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, notification_preferences")
      .in("id", unique);
    if (error || !data) return unique;
    return data
      .filter((u) => {
        const prefs = (u.notification_preferences ?? {}) as Record<string, unknown>;
        return prefs[pref] !== false;
      })
      .map((u) => u.id as string);
  } catch {
    return unique;
  }
}

/**
 * Resolve active users holding any of the given roles (e.g. leadership
 * pings to founders/owners). Excludes `excludeId` (usually the actor —
 * nobody needs a push about their own action).
 */
export async function getUserIdsByRoles(
  roles: string[],
  excludeId?: string | null,
): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id")
      .in("role", roles)
      .eq("is_active", true);
    return (data ?? [])
      .map((u) => u.id as string)
      .filter((id) => id !== excludeId);
  } catch {
    return [];
  }
}
