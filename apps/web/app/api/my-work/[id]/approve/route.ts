export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getWorkItemForUser,
  isWorkAdmin,
  logWorkEvent,
  WorkAccessError,
} from "@/lib/my-work-service";
import { notifyWorkApproved } from "@/lib/my-work-notify";
import type { WorkItem } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/my-work/[id]/approve — supervisor approves a SUBMITTED item.
 * submitted → completed. Closes the requires_approval loop.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("Only supervisors can approve work", 403);
    }
    const { id } = await params;
    const item = await getWorkItemForUser(id, user);

    if (item.status === "completed") {
      return success<WorkItem>(item); // idempotent
    }
    if (item.status !== "submitted") {
      return error("Only submitted work can be approved", 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("work_items")
      .update({ status: "completed", completed_at: now })
      .eq("id", id)
      .eq("status", "submitted") // guard against concurrent transitions
      .select("*")
      .single();
    if (updErr || !updated) {
      return error("This item is no longer awaiting approval", 409);
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: "approved",
      old_status: "submitted",
      new_status: "completed",
      performed_by: user.id,
      comment: null,
    });
    void notifyWorkApproved(updated as WorkItem);

    return success<WorkItem>(updated as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] approve failed:", err);
    return error("Failed to approve the work item", 500);
  }
}
