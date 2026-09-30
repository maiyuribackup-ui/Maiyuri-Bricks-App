/**
 * My Work — pure business logic shared by API routes and UI.
 * Overdue is DERIVED (PRD §7), never stored.
 */

import {
  CLOSED_WORK_STATUSES,
  type ChecklistResponseStatus,
  type WorkChecklistResponse,
  type WorkChecklistTemplateItem,
  type WorkItem,
  type WorkPriority,
} from "@maiyuri/shared";

// ============================================
// Overdue + grouping
// ============================================

export function isOverdue(item: WorkItem, now: Date = new Date()): boolean {
  if (!item.due_at) return false;
  if (CLOSED_WORK_STATUSES.includes(item.status)) return false;
  return new Date(item.due_at).getTime() < now.getTime();
}

export function isDueToday(item: WorkItem, now: Date = new Date()): boolean {
  if (!item.due_at) return false;
  const due = new Date(item.due_at);
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

const PRIORITY_RANK: Record<WorkPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * PRD §4 sort order: overdue → returned → priority → due time → upcoming date.
 * Items with no due date sink to the bottom of their bucket.
 */
export function sortWorkItems(
  items: WorkItem[],
  now: Date = new Date(),
): WorkItem[] {
  return [...items].sort((a, b) => {
    const aOverdue = isOverdue(a, now) ? 0 : 1;
    const bOverdue = isOverdue(b, now) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    const aReturned = a.status === "returned" ? 0 : 1;
    const bReturned = b.status === "returned" ? 0 : 1;
    if (aReturned !== bReturned) return aReturned - bReturned;

    const prioDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (prioDiff !== 0) return prioDiff;

    const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return aDue - bDue;
  });
}

export interface GroupedWork {
  attention: WorkItem[];
  today: WorkItem[];
  upcoming: WorkItem[];
  completed_today: WorkItem[];
}

/** PRD §4 sections. Attention = overdue or returned (open items only). */
export function groupWorkItems(
  items: WorkItem[],
  now: Date = new Date(),
): GroupedWork {
  const attention: WorkItem[] = [];
  const today: WorkItem[] = [];
  const upcoming: WorkItem[] = [];
  const completed_today: WorkItem[] = [];

  for (const item of items) {
    if (item.status === "cancelled") continue;

    const closed = CLOSED_WORK_STATUSES.includes(item.status);
    if (closed) {
      const doneAt = item.completed_at ?? item.submitted_at;
      if (doneAt && isSameDay(new Date(doneAt), now)) {
        completed_today.push(item);
      }
      continue;
    }

    if (isOverdue(item, now) || item.status === "returned") {
      attention.push(item);
    } else if (isDueToday(item, now) || !item.due_at) {
      // Undated open work belongs in Today — it must not disappear
      today.push(item);
    } else if (new Date(item.due_at).getTime() > now.getTime()) {
      upcoming.push(item);
    } else {
      today.push(item);
    }
  }

  return {
    attention: sortWorkItems(attention, now),
    today: sortWorkItems(today, now),
    upcoming: sortWorkItems(upcoming, now),
    completed_today,
  };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function summarize(grouped: GroupedWork, now: Date = new Date()) {
  const open = [...grouped.attention, ...grouped.today, ...grouped.upcoming];
  return {
    overdue: open.filter((i) => isOverdue(i, now)).length,
    due_today: open.filter((i) => isDueToday(i, now) && !isOverdue(i, now))
      .length,
    in_progress: open.filter((i) => i.status === "in_progress").length,
    completed_today: grouped.completed_today.length,
  };
}

// ============================================
// Completion / submission validation (PRD §12)
// ============================================

export interface ValidationIssue {
  code:
    | "note_required"
    | "photo_required"
    | "item_unanswered"
    | "fail_reason_required"
    | "fail_corrective_action_required"
    | "fail_photo_required"
    | "item_photo_required"
    | "text_required"
    | "number_required";
  message: string;
  template_item_id?: string;
}

/** Validate completing a SIMPLE task (PRD §12). */
export function validateSimpleCompletion(args: {
  item: Pick<WorkItem, "requires_note" | "requires_photo">;
  note: string | null | undefined;
  photoCount: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (args.item.requires_note && !args.note?.trim()) {
    issues.push({
      code: "note_required",
      message: "A note is required before completing this task.",
    });
  }
  if (args.item.requires_photo && args.photoCount === 0) {
    issues.push({
      code: "photo_required",
      message: "At least one photo is required before completing this task.",
    });
  }
  return issues;
}

/**
 * Validate submitting a CHECKLIST task (PRD §9 + §12).
 * `photosByResponse` maps checklist_response template_item_id → photo count.
 */
export function validateChecklistSubmission(args: {
  item: Pick<WorkItem, "requires_note" | "requires_photo">;
  note: string | null | undefined;
  itemPhotoCount: number; // photos attached at the work-item level
  templateItems: WorkChecklistTemplateItem[];
  responses: Pick<
    WorkChecklistResponse,
    | "template_item_id"
    | "status"
    | "text_value"
    | "number_value"
    | "fail_reason"
    | "corrective_action"
  >[];
  photosByTemplateItem: Record<string, number>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byItem = new Map(args.responses.map((r) => [r.template_item_id, r]));

  for (const tplItem of args.templateItems) {
    const response = byItem.get(tplItem.id);
    const status: ChecklistResponseStatus | null = response?.status ?? null;
    const photos = args.photosByTemplateItem[tplItem.id] ?? 0;

    if (tplItem.mandatory && !status) {
      // text/number items may satisfy via value instead of a status
      const hasValue =
        (tplItem.input_type === "text" && !!response?.text_value?.trim()) ||
        (tplItem.input_type === "number" && response?.number_value != null);
      if (!hasValue) {
        issues.push({
          code: "item_unanswered",
          message: `"${tplItem.prompt}" has not been answered.`,
          template_item_id: tplItem.id,
        });
        continue;
      }
    }

    if (tplItem.input_type === "text" && tplItem.mandatory) {
      if (status !== "not_applicable" && !response?.text_value?.trim()) {
        issues.push({
          code: "text_required",
          message: `"${tplItem.prompt}" needs a text answer.`,
          template_item_id: tplItem.id,
        });
      }
    }
    if (tplItem.input_type === "number" && tplItem.mandatory) {
      if (status !== "not_applicable" && response?.number_value == null) {
        issues.push({
          code: "number_required",
          message: `"${tplItem.prompt}" needs a number.`,
          template_item_id: tplItem.id,
        });
      }
    }

    if (tplItem.requires_photo && status !== "not_applicable" && photos === 0) {
      issues.push({
        code: "item_photo_required",
        message: `"${tplItem.prompt}" requires a photo.`,
        template_item_id: tplItem.id,
      });
    }

    if (status === "not_completed") {
      if (!response?.fail_reason?.trim()) {
        issues.push({
          code: "fail_reason_required",
          message: `"${tplItem.prompt}" is marked Not Completed — a reason is required.`,
          template_item_id: tplItem.id,
        });
      }
      if (
        tplItem.requires_corrective_action_on_fail &&
        !response?.corrective_action?.trim()
      ) {
        issues.push({
          code: "fail_corrective_action_required",
          message: `"${tplItem.prompt}" needs a corrective action.`,
          template_item_id: tplItem.id,
        });
      }
      if (tplItem.requires_photo_on_fail && photos === 0) {
        issues.push({
          code: "fail_photo_required",
          message: `"${tplItem.prompt}" is Not Completed — a photo is required.`,
          template_item_id: tplItem.id,
        });
      }
    }
  }

  // Work-item-level requirements apply on top of per-item ones
  issues.push(
    ...validateSimpleCompletion({
      item: args.item,
      note: args.note,
      photoCount: args.itemPhotoCount,
    }),
  );

  return issues;
}

// ============================================
// Small display helpers
// ============================================

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/** Whether the assignee can still edit (mirror of the RLS rule). */
export function isEditable(status: WorkItem["status"]): boolean {
  return (
    status === "pending" || status === "in_progress" || status === "returned"
  );
}
