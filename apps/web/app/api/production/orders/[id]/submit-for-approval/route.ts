export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { submitProductionOrderForApproval } from "@/lib/ticket-service";
import {
  filterByPushPref,
  getUserIdsByRoles,
  sendPushToUsers,
} from "@/lib/push/fcm";
import { submitForApprovalSchema } from "@maiyuri/shared";
import type { Ticket } from "@maiyuri/shared";

// POST /api/production/orders/[id]/submit-for-approval - Submit a production order for approval
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Cookie session (web) OR Bearer token (mobile app), plus role gate.
    const auth = await requireProductionRole(request);
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const { id } = await params;

    const parsed = await parseBody(request, submitForApprovalSchema);
    if (parsed.error) return parsed.error;

    const result = await submitProductionOrderForApproval(
      id,
      user.id,
      parsed.data.priority,
      parsed.data.notes ?? undefined,
      parsed.data.due_date ?? undefined,
    );

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    // Ping leadership that an approval is waiting (best-effort; excludes the
    // submitter; respects the push_ops preference).
    try {
      const ticket = result.data!;
      const leadership = await getUserIdsByRoles(["founder", "owner"], user.id);
      const recipients = await filterByPushPref(leadership, "push_ops");
      if (recipients.length > 0) {
        await sendPushToUsers(recipients, {
          title: "🏭 Production order awaiting approval",
          body: ticket.title ?? "A production order needs your review.",
          data: { url: "/production" },
        });
      }
    } catch (pushErr) {
      console.error("Approval push failed:", pushErr);
    }

    return success<Ticket>(result.data!);
  } catch (err) {
    console.error("Error submitting for approval:", err);
    return error("Internal server error", 500);
  }
}
