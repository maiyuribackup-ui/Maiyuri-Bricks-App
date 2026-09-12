/**
 * Reimbursement push notifications. Fire-and-forget — never fail a write
 * because a push failed. Deep link `/onehub/expenses` resolves on web + native.
 */
import {
  filterByPushPref,
  getUserIdsByRoles,
  isFcmConfigured,
  sendPushToUsers,
} from "@/lib/push/fcm";
import { EXPENSE_ADMIN_ROLES } from "@/lib/expenses";

const URL = "/onehub/expenses";

async function safeSend(
  userIds: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  try {
    if (!isFcmConfigured() || userIds.length === 0) return;
    const recipients = await filterByPushPref(userIds, "push_ops");
    if (!recipients.length) return;
    await sendPushToUsers(recipients, payload);
  } catch (err) {
    console.error("[Expenses] push failed (ignored):", err);
  }
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** New claim submitted → tell the admins (approvers). */
export async function notifyExpenseSubmitted(opts: {
  submitterName: string;
  amount: number;
  typeName: string;
}): Promise<void> {
  const admins = await getUserIdsByRoles(EXPENSE_ADMIN_ROLES);
  await safeSend(admins, {
    title: "🧾 Expense to approve",
    body: `${opts.submitterName}: ${opts.typeName} ${inr(opts.amount)}`,
    data: { url: URL },
  });
}

export async function notifyExpenseApproved(opts: {
  userId: string;
  amount: number;
}): Promise<void> {
  await safeSend([opts.userId], {
    title: "✅ Expense approved",
    body: `Your ${inr(opts.amount)} claim was approved.`,
    data: { url: URL },
  });
}

export async function notifyExpenseRejected(opts: {
  userId: string;
  amount: number;
  reason: string;
}): Promise<void> {
  await safeSend([opts.userId], {
    title: "❌ Expense rejected",
    body: `${inr(opts.amount)} — ${opts.reason}`.slice(0, 140),
    data: { url: URL },
  });
}

export async function notifyTopup(opts: {
  userId: string;
  amount: number;
}): Promise<void> {
  await safeSend([opts.userId], {
    title: "💰 Petty cash added",
    body: `${inr(opts.amount)} added to your balance.`,
    data: { url: URL },
  });
}
