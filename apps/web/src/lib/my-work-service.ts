/**
 * My Work — server-side service helpers shared by the /api/my-work routes.
 * All DB access uses the service-role client; authorization is enforced
 * here (RLS is defense in depth — see the migration header).
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthenticatedUser } from "@/lib/api-helpers";
import type {
  WorkChecklistInstance,
  WorkChecklistResponse,
  WorkChecklistTemplateItem,
  WorkItem,
  WorkItemAttachment,
} from "@maiyuri/shared";

/** Roles that can create/assign/cancel work and review submissions */
export const WORK_ADMIN_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
] as const;

export function isWorkAdmin(role: string): boolean {
  return (WORK_ADMIN_ROLES as readonly string[]).includes(role);
}

export const WORK_ITEM_COLUMNS = "*";

/** Signed-URL lifetime for evidence photos (1 hour) */
const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const WORK_PHOTO_BUCKET = "work-item-photos";

export class WorkAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Load a work item and verify the caller may access it.
 * Assignees always may; admins/supervisors may; everyone else gets 403.
 * Returns 404 via WorkAccessError when the row doesn't exist.
 */
export async function getWorkItemForUser(
  workItemId: string,
  user: AuthenticatedUser,
): Promise<WorkItem> {
  const { data, error } = await supabaseAdmin
    .from("work_items")
    .select(WORK_ITEM_COLUMNS)
    .eq("id", workItemId)
    .single();

  if (error || !data) {
    throw new WorkAccessError("Work item not found", 404);
  }

  const item = data as WorkItem;
  if (item.assigned_user_id !== user.id && !isWorkAdmin(user.role)) {
    // Don't reveal existence to unrelated users
    throw new WorkAccessError("Work item not found", 404);
  }
  return item;
}

/** Assignee-only guard for mutating actions */
export function assertAssignee(item: WorkItem, user: AuthenticatedUser): void {
  if (item.assigned_user_id !== user.id) {
    throw new WorkAccessError(
      "Only the assigned user can act on this work item",
      403,
    );
  }
}

export function assertActionable(item: WorkItem): void {
  if (!["pending", "in_progress", "returned"].includes(item.status)) {
    throw new WorkAccessError(
      "This work item is locked and can no longer be edited",
      409,
    );
  }
}

/** Fetch checklist instance + template items + responses for a work item */
export async function loadChecklistBundle(
  checklistInstanceId: string,
): Promise<{
  instance: WorkChecklistInstance;
  templateItems: WorkChecklistTemplateItem[];
  responses: WorkChecklistResponse[];
}> {
  const { data: instance, error: instErr } = await supabaseAdmin
    .from("work_checklist_instances")
    .select("*, template:work_checklist_templates(*)")
    .eq("id", checklistInstanceId)
    .single();

  if (instErr || !instance) {
    throw new WorkAccessError("Checklist instance not found", 404);
  }

  const [{ data: templateItems }, { data: responses }] = await Promise.all([
    supabaseAdmin
      .from("work_checklist_template_items")
      .select("*")
      .eq("template_id", instance.template_id)
      .order("sort_order"),
    supabaseAdmin
      .from("work_checklist_responses")
      .select("*")
      .eq("instance_id", checklistInstanceId),
  ]);

  return {
    instance: instance as WorkChecklistInstance,
    templateItems: (templateItems ?? []) as WorkChecklistTemplateItem[],
    responses: (responses ?? []) as WorkChecklistResponse[],
  };
}

/** Attachments with fresh signed URLs */
export async function loadAttachments(
  workItemId: string,
): Promise<WorkItemAttachment[]> {
  const { data } = await supabaseAdmin
    .from("work_item_attachments")
    .select("*")
    .eq("work_item_id", workItemId)
    .order("created_at");

  const attachments = (data ?? []) as WorkItemAttachment[];
  if (attachments.length === 0) return attachments;

  const { data: signed } = await supabaseAdmin.storage
    .from(WORK_PHOTO_BUCKET)
    .createSignedUrls(
      attachments.map((a) => a.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );

  return attachments.map((a, i) => ({
    ...a,
    url: signed?.[i]?.signedUrl ?? undefined,
  }));
}

/** Count photos per checklist template item for validation */
export function photosByTemplateItem(
  attachments: WorkItemAttachment[],
  responses: WorkChecklistResponse[],
): Record<string, number> {
  const responseToItem = new Map(
    responses.map((r) => [r.id, r.template_item_id]),
  );
  const counts: Record<string, number> = {};
  for (const att of attachments) {
    if (!att.checklist_response_id) continue;
    const itemId = responseToItem.get(att.checklist_response_id);
    if (itemId) counts[itemId] = (counts[itemId] ?? 0) + 1;
  }
  return counts;
}

/** Append an audit event (best-effort — never blocks the main action) */
export async function logWorkEvent(entry: {
  work_item_id: string;
  event_type: string;
  old_status?: string | null;
  new_status?: string | null;
  performed_by?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("work_item_events").insert({
    work_item_id: entry.work_item_id,
    event_type: entry.event_type,
    old_status: entry.old_status ?? null,
    new_status: entry.new_status ?? null,
    performed_by: entry.performed_by ?? null,
    comment: entry.comment ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.error("[MyWork] Failed to log event:", entry.event_type, error);
  }
}
