export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  assertActionable,
  assertAssignee,
  getWorkItemForUser,
  loadAttachments,
  loadChecklistBundle,
  logWorkEvent,
  photosByTemplateItem,
  WorkAccessError,
} from "@/lib/my-work-service";
import { validateChecklistSubmission } from "@/lib/my-work-utils";
import { notifyWorkSubmitted } from "@/lib/my-work-notify";
import type { WorkItem } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/my-work/[id]/submit — CHECKLIST tasks (PRD §9 + §12).
 * Enforces: mandatory items answered, fail reasons + corrective actions +
 * fail photos where configured, item-level photo requirements, then locks.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    assertAssignee(item, user);
    assertActionable(item);

    if (!item.checklist_instance_id) {
      return error("This work item has no checklist to submit", 400);
    }

    const [bundle, attachments] = await Promise.all([
      loadChecklistBundle(item.checklist_instance_id),
      loadAttachments(id),
    ]);

    const itemLevelPhotos = attachments.filter(
      (a) => !a.checklist_response_id,
    ).length;

    const issues = validateChecklistSubmission({
      item,
      note: item.note,
      itemPhotoCount: itemLevelPhotos,
      templateItems: bundle.templateItems,
      responses: bundle.responses,
      photosByTemplateItem: photosByTemplateItem(attachments, bundle.responses),
    });

    if (issues.length > 0) {
      // Human-readable summary — the client shows this straight in a toast.
      // (Previously this stringified the raw JSON, which dumped a wall of
      // {"validation_issues":[…]} onto the user's screen.)
      const n = issues.length;
      const summary =
        `Can't submit yet — please fix ${n} item${n > 1 ? "s" : ""}:\n` +
        issues.map((i) => `• ${i.message}`).join("\n");
      return error(summary, 422);
    }

    const now = new Date().toISOString();
    const targetStatus = item.requires_approval ? "submitted" : "completed";
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("work_items")
      .update({
        status: targetStatus,
        submitted_at: now,
        completed_at: targetStatus === "completed" ? now : null,
        started_at: item.started_at ?? now,
      })
      .eq("id", id)
      .in("status", ["pending", "in_progress", "returned"]) // no double-submit
      .select("*")
      .single();

    if (updErr || !updated) {
      return error("This work item was already submitted", 409);
    }

    await supabaseAdmin
      .from("work_checklist_instances")
      .update({ completed_at: now })
      .eq("id", item.checklist_instance_id);

    await logWorkEvent({
      work_item_id: id,
      event_type: targetStatus === "completed" ? "completed" : "submitted",
      old_status: item.status,
      new_status: targetStatus,
      performed_by: user.id,
      metadata: {
        checklist_instance_id: item.checklist_instance_id,
        not_completed_items: bundle.responses.filter(
          (r) => r.status === "not_completed",
        ).length,
      },
    });
    if (targetStatus === "submitted") {
      void notifyWorkSubmitted(updated as WorkItem);
    }

    return success<WorkItem>(updated as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] submit failed:", err);
    return error("Failed to submit the checklist", 500);
  }
}
