export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isWorkAdmin,
  logWorkEvent,
} from "@/lib/my-work-service";
import { notifyWorkAssigned } from "@/lib/my-work-notify";
import { groupWorkItems, summarize } from "@/lib/my-work-utils";
import { createWorkItemSchema } from "@maiyuri/shared";
import type { MyWorkQueue, WorkItem } from "@maiyuri/shared";

const UPCOMING_LIMIT = 20;

/**
 * GET /api/my-work — the signed-in employee's queue.
 * ?view=review (supervisors): all SUBMITTED items awaiting approval instead.
 * Loads only what the page needs (PRD §22): open items + today's closed items.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    // Supervisor review queue: every submitted item, oldest first.
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "review") {
      if (!isWorkAdmin(user.role)) {
        return error("Only supervisors can review submissions", 403);
      }
      const { data, error: revErr } = await supabaseAdmin
        .from("work_items")
        .select(
          "*, assigned_user:users!work_items_assigned_user_id_fkey(id, name)",
        )
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true })
        .limit(100);
      if (revErr) return error("Failed to load the review queue", 500);
      return success<WorkItem[]>((data ?? []) as WorkItem[]);
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [openRes, closedTodayRes] = await Promise.all([
      supabaseAdmin
        .from("work_items")
        .select("*, checklist_instance:work_checklist_instances(id, template_id)")
        .eq("assigned_user_id", user.id)
        .in("status", ["pending", "in_progress", "returned"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(200),
      supabaseAdmin
        .from("work_items")
        .select("*")
        .eq("assigned_user_id", user.id)
        .in("status", ["submitted", "completed"])
        .gte("updated_at", startOfDay.toISOString())
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    if (openRes.error || closedTodayRes.error) {
      console.error(
        "[MyWork] queue fetch failed:",
        openRes.error ?? closedTodayRes.error,
      );
      return error("Failed to load your work", 500);
    }

    const all = [
      ...((openRes.data ?? []) as WorkItem[]),
      ...((closedTodayRes.data ?? []) as WorkItem[]),
    ];
    const grouped = groupWorkItems(all);
    grouped.upcoming = grouped.upcoming.slice(0, UPCOMING_LIMIT);

    const queue: MyWorkQueue = {
      summary: summarize(grouped),
      attention: grouped.attention,
      today: grouped.today,
      upcoming: grouped.upcoming,
      completed_today: grouped.completed_today,
    };

    return success<MyWorkQueue>(queue);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] GET failed:", err);
    return error("Failed to load your work", 500);
  }
}

/**
 * POST /api/my-work — create + assign a work item (admins/supervisors).
 * For checklist tasks, also creates the dated checklist instance the item
 * points at (PRD §16E: the work item references an instance, not a template).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("You do not have permission to create work items", 403);
    }

    const parsed = await parseBody(request, createWorkItemSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    if (input.activity_type === "checklist" && !input.checklist_template_id) {
      return error("A checklist template is required for checklist tasks", 400);
    }

    // Create the checklist instance first (if needed) so the item can link it
    let checklistInstanceId: string | null = null;
    if (input.activity_type === "checklist" && input.checklist_template_id) {
      const { data: template } = await supabaseAdmin
        .from("work_checklist_templates")
        .select("id, active")
        .eq("id", input.checklist_template_id)
        .single();
      if (!template || !template.active) {
        return error("Checklist template not found or inactive", 400);
      }

      const scheduledDate = input.due_at
        ? input.due_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const { data: instance, error: instErr } = await supabaseAdmin
        .from("work_checklist_instances")
        .insert({
          template_id: input.checklist_template_id,
          scheduled_date: scheduledDate,
        })
        .select("id")
        .single();
      if (instErr || !instance) {
        console.error("[MyWork] instance create failed:", instErr);
        return error("Failed to prepare the checklist", 500);
      }
      checklistInstanceId = instance.id;
    }

    const { checklist_template_id: _tpl, ...rest } = input;
    const { data: item, error: insertErr } = await supabaseAdmin
      .from("work_items")
      .insert({
        ...rest,
        assigned_by_user_id: user.id,
        checklist_instance_id: checklistInstanceId,
        status: "pending",
      })
      .select("*")
      .single();

    if (insertErr || !item) {
      console.error("[MyWork] create failed:", insertErr);
      // Don't orphan the instance we just created
      if (checklistInstanceId) {
        await supabaseAdmin
          .from("work_checklist_instances")
          .delete()
          .eq("id", checklistInstanceId);
      }
      return error("Failed to create the work item", 500);
    }

    await logWorkEvent({
      work_item_id: item.id,
      event_type: "created",
      new_status: "pending",
      performed_by: user.id,
      metadata: { assigned_user_id: input.assigned_user_id },
    });
    await logWorkEvent({
      work_item_id: item.id,
      event_type: "assigned",
      performed_by: user.id,
      metadata: { assigned_user_id: input.assigned_user_id },
    });
    void notifyWorkAssigned(item as WorkItem);

    return success<WorkItem>(item as WorkItem);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] POST failed:", err);
    return error("Failed to create the work item", 500);
  }
}
