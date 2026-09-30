export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  assertActionable,
  assertAssignee,
  getWorkItemForUser,
  loadAttachments,
  logWorkEvent,
  WorkAccessError,
} from "@/lib/my-work-service";
import { validateSimpleCompletion } from "@/lib/my-work-utils";
import { notifyWorkSubmitted } from "@/lib/my-work-notify";
import { completeWorkItemSchema } from "@maiyuri/shared";
import type { WorkItem } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/my-work/[id]/complete — SIMPLE tasks (PRD §12).
 * Validates mandatory note/photo before completing. Checklist tasks must
 * use /submit instead.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    assertAssignee(item, user);
    assertActionable(item);

    if (item.activity_type === "checklist") {
      return error("Checklist tasks must be submitted, not completed directly", 400);
    }

    const parsed = await parseBody(request, completeWorkItemSchema);
    if (parsed.error) return parsed.error;
    const note = parsed.data.note ?? item.note;

    const attachments = await loadAttachments(id);
    const issues = validateSimpleCompletion({
      item,
      note,
      photoCount: attachments.length,
    });
    if (issues.length > 0) {
      return error(issues.map((i) => i.message).join(" "), 422);
    }

    const now = new Date().toISOString();
    const targetStatus = item.requires_approval ? "submitted" : "completed";
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("work_items")
      .update({
        status: targetStatus,
        note,
        submitted_at: now,
        completed_at: targetStatus === "completed" ? now : null,
        started_at: item.started_at ?? now,
      })
      .eq("id", id)
      .in("status", ["pending", "in_progress", "returned"]) // no double-complete
      .select("*")
      .single();

    if (updErr || !updated) {
      return error("This work item was already submitted", 409);
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: targetStatus === "completed" ? "completed" : "submitted",
      old_status: item.status,
      new_status: targetStatus,
      performed_by: user.id,
      comment: note ?? null,
    });
    if (targetStatus === "submitted") {
      void notifyWorkSubmitted(updated as WorkItem);
    }

    return success<WorkItem>(updated as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] complete failed:", err);
    return error("Failed to complete the work item", 500);
  }
}
