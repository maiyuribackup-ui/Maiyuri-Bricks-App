export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getWorkItemForUser,
  isWorkAdmin,
  logWorkEvent,
  WorkAccessError,
} from "@/lib/my-work-service";
import { notifyWorkReturned } from "@/lib/my-work-notify";
import type { WorkItem } from "@maiyuri/shared";

const returnSchema = z.object({
  reason: z.string().min(3, "Explain what needs to be corrected"),
});

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/my-work/[id]/return — supervisor sends a SUBMITTED item back.
 * submitted → returned (assignee can then fix and resubmit).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("Only supervisors can return work", 403);
    }
    const { id } = await params;
    const item = await getWorkItemForUser(id, user);

    if (item.status !== "submitted") {
      return error("Only submitted work can be returned", 409);
    }

    const parsed = await parseBody(request, returnSchema);
    if (parsed.error) return parsed.error;
    const reason = parsed.data.reason.trim();

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("work_items")
      .update({
        status: "returned",
        returned_at: now,
        return_reason: reason,
        // clear the submission markers so the next submit is clean
        submitted_at: null,
      })
      .eq("id", id)
      .eq("status", "submitted")
      .select("*")
      .single();
    if (updErr || !updated) {
      return error("This item is no longer awaiting review", 409);
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: "returned",
      old_status: "submitted",
      new_status: "returned",
      performed_by: user.id,
      comment: reason,
    });
    void notifyWorkReturned(updated as WorkItem, reason);

    return success<WorkItem>(updated as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] return failed:", err);
    return error("Failed to return the work item", 500);
  }
}
