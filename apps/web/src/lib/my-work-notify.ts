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
  filterByPushPref,
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
    // Respect each user's notification_preferences like every other flow
    // (completeness audit #7 — My Work previously bypassed prefs).
    const recipients = await filterByPushPref(userIds, "push_ops");
    if (!recipients.length) return;
    await sendPushToUsers(recipients, payload);
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

/**
 * Escalating nag (SR2) — repeats every cron run until the task moves.
 * Tone hardens with the nudge count; Tamil + English so the least
 * tech-savvy staffer can't misread it.
 */
export async function notifyWorkNudge(
  item: Pick<WorkItem, "id" | "title" | "assigned_user_id" | "status">,
  nudgeNo: number,
  overdue: boolean,
): Promise<void> {
  const title = overdue
    ? "🔴 வேலை தாமதம்! · Task overdue!"
    : nudgeNo <= 1
      ? "⏰ நினைவூட்டல் · Reminder"
      : "⏰ இன்னும் காத்திருக்கிறது · Still waiting";
  const action =
    item.status === "pending"
      ? "தொடங்கவும் · please start"
      : "முடிக்கவும் · please finish";
  await safeSend([item.assigned_user_id], {
    title,
    body: `${item.title} — ${action}`.slice(0, 180),
    data: { url: itemUrl(item.id) },
  });
}

/** Escalation (SR3) — the boss finds out. Sent ONCE per item. */
export async function notifyWorkEscalated(
  item: Pick<WorkItem, "id" | "title" | "due_at">,
  assigneeName: string,
  hoursOverdue: number,
): Promise<void> {
  try {
    const admins = await getUserIdsByRoles(["founder", "owner"]);
    await safeSend(admins, {
      title: "🚨 Work not done — escalation",
      body: `${assigneeName}: "${item.title}" is ${hoursOverdue}h overdue`.slice(
        0,
        180,
      ),
      data: { url: itemUrl(item.id) },
    });
  } catch (err) {
    console.error("[MyWork] escalation push failed (ignored):", err);
  }
}

/** Evening chaser (SR4) — one summary per assignee at 6pm IST. */
export async function notifyEveningChaser(
  userId: string,
  titles: string[],
): Promise<void> {
  const head = titles.slice(0, 3).join(", ");
  const extra = titles.length > 3 ? ` +${titles.length - 3}` : "";
  await safeSend([userId], {
    title: `🌆 இன்று முடிக்காதவை: ${titles.length} · Not finished today`,
    body: `${head}${extra} — நாளைக்கு விடாதீர்கள் · don't leave it for tomorrow`.slice(
      0,
      180,
    ),
    data: { url: "/onehub/my-work" },
  });
}
