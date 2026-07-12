/**
 * My Work push notifications. Fire-and-forget: callers must never fail a
 * write because a push failed — always await via `void notify…()` or wrap
 * in try/catch inside the route.
 *
 * Deep link `/onehub/my-work/{id}` resolves on BOTH surfaces: the web page
 * and the native expo-router screen (notification tap → router.push(url)).
 */
import type { WorkItem } from "@maiyuri/shared";
import {
  getUserIdsByRoles,
  isFcmConfigured,
  sendPushToUsers,
} from "@/lib/push/fcm";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { WORK_ADMIN_ROLES } from "@/lib/my-work-service";

const itemUrl = (id: string) => `/onehub/my-work/${id}`;

async function safeSend(
  userIds: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  try {
    if (!isFcmConfigured() || userIds.length === 0) return;
    await sendPushToUsers(userIds, payload);
  } catch (err) {
    console.error("[MyWork] push failed (ignored):", err);
  }
}

/** New work assigned → tell the assignee. */
export async function notifyWorkAssigned(item: WorkItem): Promise<void> {
  await safeSend([item.assigned_user_id], {
    title: "🆕 New work assigned",
    body: item.title,
    data: { url: itemUrl(item.id) },
  });
}

/** Work submitted for approval → tell supervisors (except the submitter). */
export async function notifyWorkSubmitted(item: WorkItem): Promise<void> {
  try {
    const [admins, { data: submitter }] = await Promise.all([
      getUserIdsByRoles([...WORK_ADMIN_ROLES]),
      supabaseAdmin
        .from("users")
        .select("name")
        .eq("id", item.assigned_user_id)
        .single(),
    ]);
    const recipients = admins.filter((id) => id !== item.assigned_user_id);
    await safeSend(recipients, {
      title: "📥 Work submitted for review",
      body: `${submitter?.name ?? "A team member"}: ${item.title}`,
      data: { url: itemUrl(item.id) },
    });
  } catch (err) {
    console.error("[MyWork] submit push failed (ignored):", err);
  }
}

/** Approved → tell the assignee. */
export async function notifyWorkApproved(item: WorkItem): Promise<void> {
  await safeSend([item.assigned_user_id], {
    title: "✅ Work approved",
    body: item.title,
    data: { url: itemUrl(item.id) },
  });
}

/** Returned for correction → tell the assignee (include the reason). */
export async function notifyWorkReturned(
  item: WorkItem,
  reason: string,
): Promise<void> {
  await safeSend([item.assigned_user_id], {
    title: "↩️ Returned for correction",
    body: `${item.title} — ${reason}`.slice(0, 180),
    data: { url: itemUrl(item.id) },
  });
}
