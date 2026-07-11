export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  assertAssignee,
  getWorkItemForUser,
  logWorkEvent,
  WorkAccessError,
} from "@/lib/my-work-service";
import type { WorkItem } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/my-work/[id]/start — pending/returned → in_progress
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    assertAssignee(item, user);

    if (item.status === "in_progress") {
      return success<WorkItem>(item); // idempotent — already started
    }
    if (item.status !== "pending" && item.status !== "returned") {
      return error("This work item can no longer be started", 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("work_items")
      .update({ status: "in_progress", started_at: item.started_at ?? now })
      .eq("id", id)
      .eq("status", item.status) // guard against concurrent transitions
      .select("*")
      .single();

    if (updErr || !updated) {
      return error("Failed to start the work item", 500);
    }

    // Stamp the checklist instance start too
    if (item.checklist_instance_id) {
      await supabaseAdmin
        .from("work_checklist_instances")
        .update({ started_at: now })
        .eq("id", item.checklist_instance_id)
        .is("started_at", null);
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: "started",
      old_status: item.status,
      new_status: "in_progress",
      performed_by: user.id,
    });

    return success<WorkItem>(updated as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] start failed:", err);
    return error("Failed to start the work item", 500);
  }
}
