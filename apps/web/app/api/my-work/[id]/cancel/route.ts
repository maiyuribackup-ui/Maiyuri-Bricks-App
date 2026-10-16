export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getWorkItemForUser,
  isWorkAdmin,
  logWorkEvent,
  WorkAccessError,
} from "@/lib/my-work-service";
import { cancelWorkItemSchema } from "@maiyuri/shared";
import type { WorkItem } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/my-work/[id]/cancel — admins/supervisors only
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("You do not have permission to cancel work items", 403);
    }
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    if (item.status === "completed" || item.status === "cancelled") {
      return error(`This work item is already ${item.status}`, 409);
    }

    const parsed = await parseBody(request, cancelWorkItemSchema);
    if (parsed.error) return parsed.error;

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("work_items")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updErr || !updated) {
      return error("Failed to cancel the work item", 500);
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: "cancelled",
      old_status: item.status,
      new_status: "cancelled",
      performed_by: user.id,
      comment: parsed.data.reason,
    });

    return success<WorkItem>(updated as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] cancel failed:", err);
    return error("Failed to cancel the work item", 500);
  }
}
