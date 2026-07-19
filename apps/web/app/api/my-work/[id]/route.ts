export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getWorkItemForUser,
  loadAttachments,
  loadChecklistBundle,
  WorkAccessError,
} from "@/lib/my-work-service";
import type { WorkItem } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/my-work/[id] — full work item detail:
 * checklist (items merged with responses), attachments (signed URLs),
 * and the audit history (sanitized — event rows only, no raw metadata dump).
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);

    const [attachments, eventsRes, assigneeRes] = await Promise.all([
      loadAttachments(id),
      supabaseAdmin
        .from("work_item_events")
        .select(
          "id, work_item_id, event_type, old_status, new_status, performed_by, comment, created_at, performed_by_user:users!work_item_events_performed_by_fkey(id, name)",
        )
        .eq("work_item_id", id)
        // Draft saves would flood the timeline — surface meaningful events only
        .neq("event_type", "draft_saved")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("users")
        .select("id, name")
        .eq("id", item.assigned_user_id)
        .single(),
    ]);

    // Supabase types FK joins as arrays; normalize to a single object
    const events = (eventsRes.data ?? []).map((event) => ({
      ...event,
      performed_by_user: Array.isArray(event.performed_by_user)
        ? (event.performed_by_user[0] ?? null)
        : event.performed_by_user,
    }));

    const detail: WorkItem = {
      ...item,
      attachments,
      events,
      assigned_user: assigneeRes.data ?? null,
    };

    if (item.checklist_instance_id) {
      const bundle = await loadChecklistBundle(item.checklist_instance_id);
      detail.checklist_instance = {
        ...bundle.instance,
        template: {
          ...(bundle.instance.template ?? {
            id: bundle.instance.template_id,
            name: "Checklist",
            description: null,
            active: true,
            created_by: null,
            created_at: "",
            updated_at: "",
          }),
          items: bundle.templateItems,
        },
        responses: bundle.responses,
      };
      const answered = bundle.responses.filter(
        (r) => r.status !== null || r.text_value || r.number_value != null,
      ).length;
      detail.checklist_progress = {
        answered,
        total: bundle.templateItems.length,
      };
    }

    return success<WorkItem>(detail);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] detail failed:", err);
    return error("Failed to load the work item", 500);
  }
}
