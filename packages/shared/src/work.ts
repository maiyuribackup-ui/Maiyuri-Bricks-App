/**
 * My Work module — shared types + zod schemas.
 * Data model: supabase/migrations/20260711000001_my_work.sql
 * PRD: docs/PRD_MY_WORK.md
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

export const workActivityTypeSchema = z.enum([
  "simple",
  "checklist",
  "inspection",
  "report",
  "approval",
]);
export type WorkActivityType = z.infer<typeof workActivityTypeSchema>;

export const workItemStatusSchema = z.enum([
  "pending",
  "in_progress",
  "submitted",
  "completed",
  "returned",
  "cancelled",
]);
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;

export const workPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type WorkPriority = z.infer<typeof workPrioritySchema>;

export const checklistResponseStatusSchema = z.enum([
  "completed",
  "not_completed",
  "not_applicable",
]);
export type ChecklistResponseStatus = z.infer<
  typeof checklistResponseStatusSchema
>;

export const checklistInputTypeSchema = z.enum(["status", "text", "number"]);
export type ChecklistInputType = z.infer<typeof checklistInputTypeSchema>;

/** Statuses in which the assignee may still act on the item */
export const OPEN_WORK_STATUSES: readonly WorkItemStatus[] = [
  "pending",
  "in_progress",
  "returned",
];

/** Statuses that count as "closed" for overdue derivation */
export const CLOSED_WORK_STATUSES: readonly WorkItemStatus[] = [
  "submitted",
  "completed",
  "cancelled",
];

// ============================================
// Row types
// ============================================

export interface WorkChecklistTemplateItem {
  id: string;
  template_id: string;
  prompt: string;
  sort_order: number;
  input_type: ChecklistInputType;
  mandatory: boolean;
  allow_na: boolean;
  requires_photo: boolean;
  requires_photo_on_fail: boolean;
  requires_corrective_action_on_fail: boolean;
  created_at: string;
}

export interface WorkChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: WorkChecklistTemplateItem[];
}

export interface WorkChecklistResponse {
  id: string;
  instance_id: string;
  template_item_id: string;
  status: ChecklistResponseStatus | null;
  text_value: string | null;
  number_value: number | null;
  note: string | null;
  fail_reason: string | null;
  corrective_action: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkChecklistInstance {
  id: string;
  template_id: string;
  scheduled_date: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  template?: WorkChecklistTemplate;
  responses?: WorkChecklistResponse[];
}

export interface WorkItemAttachment {
  id: string;
  work_item_id: string;
  checklist_response_id: string | null;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  created_at: string;
  /** short-lived signed URL, populated by the API */
  url?: string;
}

export interface WorkItemEvent {
  id: string;
  work_item_id: string;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  comment: string | null;
  /** omitted from employee-facing API responses (PRD §18) */
  metadata?: Record<string, unknown>;
  created_at: string;
  performed_by_user?: { id: string; name: string } | null;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  activity_type: WorkActivityType;
  status: WorkItemStatus;
  priority: WorkPriority;
  assigned_user_id: string;
  assigned_by_user_id: string | null;
  due_at: string | null;
  available_from: string | null;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  return_reason: string | null;
  note: string | null;
  source_module: string | null;
  source_record_id: string | null;
  related_project_id: string | null;
  related_lead_id: string | null;
  related_label: string | null;
  checklist_instance_id: string | null;
  linked_sop_slug: string | null;
  requires_photo: boolean;
  requires_note: boolean;
  requires_approval: boolean;
  template_id: string | null;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
  // joined by the API where useful
  checklist_instance?: WorkChecklistInstance | null;
  attachments?: WorkItemAttachment[];
  events?: WorkItemEvent[];
  assigned_user?: { id: string; name: string } | null;
  checklist_progress?: { answered: number; total: number } | null;
}

export interface MyWorkSummary {
  overdue: number;
  due_today: number;
  in_progress: number;
  completed_today: number;
}

export interface MyWorkQueue {
  summary: MyWorkSummary;
  attention: WorkItem[]; // overdue + returned
  today: WorkItem[];
  upcoming: WorkItem[];
  completed_today: WorkItem[];
}

// ============================================
// Input schemas
// ============================================

export const createWorkItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  activity_type: workActivityTypeSchema.default("simple"),
  priority: workPrioritySchema.default("medium"),
  assigned_user_id: z.string().uuid("Assignee is required"),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  available_from: z.string().datetime({ offset: true }).nullable().optional(),
  related_project_id: z.string().uuid().nullable().optional(),
  related_lead_id: z.string().uuid().nullable().optional(),
  related_label: z.string().nullable().optional(),
  linked_sop_slug: z.string().nullable().optional(),
  checklist_template_id: z.string().uuid().nullable().optional(),
  requires_photo: z.boolean().default(false),
  requires_note: z.boolean().default(false),
  requires_approval: z.boolean().default(false),
});
export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>;

export const saveWorkDraftSchema = z.object({
  note: z.string().nullable().optional(),
  responses: z
    .array(
      z.object({
        template_item_id: z.string().uuid(),
        status: checklistResponseStatusSchema.nullable().optional(),
        text_value: z.string().nullable().optional(),
        number_value: z.number().nullable().optional(),
        note: z.string().nullable().optional(),
        fail_reason: z.string().nullable().optional(),
        corrective_action: z.string().nullable().optional(),
      }),
    )
    .optional(),
});
export type SaveWorkDraftInput = z.infer<typeof saveWorkDraftSchema>;

export const completeWorkItemSchema = z.object({
  note: z.string().nullable().optional(),
});
export type CompleteWorkItemInput = z.infer<typeof completeWorkItemSchema>;

export const cancelWorkItemSchema = z.object({
  reason: z.string().min(1, "A cancellation reason is required"),
});

export const createChecklistTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        prompt: z.string().min(1),
        input_type: checklistInputTypeSchema.default("status"),
        mandatory: z.boolean().default(true),
        allow_na: z.boolean().default(true),
        requires_photo: z.boolean().default(false),
        requires_photo_on_fail: z.boolean().default(false),
        requires_corrective_action_on_fail: z.boolean().default(true),
      }),
    )
    .min(1, "At least one checklist item is required"),
});
export type CreateChecklistTemplateInput = z.infer<
  typeof createChecklistTemplateSchema
>;

export const myWorkFilterSchema = z.enum([
  "all",
  "overdue",
  "today",
  "upcoming",
  "completed",
]);
export type MyWorkFilter = z.infer<typeof myWorkFilterSchema>;

// ============================================
// User-facing labels (PRD §7)
// ============================================

export const WORK_STATUS_LABELS: Record<WorkItemStatus | "overdue", string> = {
  pending: "Pending",
  in_progress: "In Progress",
  submitted: "Submitted",
  completed: "Completed",
  returned: "Returned for Correction",
  cancelled: "Cancelled",
  overdue: "Overdue",
};
