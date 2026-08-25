import { describe, expect, it } from "vitest";
import type {
  WorkChecklistTemplateItem,
  WorkItem,
} from "@maiyuri/shared";
import {
  greetingForHour,
  groupWorkItems,
  isEditable,
  isOverdue,
  sortWorkItems,
  summarize,
  validateChecklistSubmission,
  validateSimpleCompletion,
} from "./my-work-utils";

const NOW = new Date("2026-07-11T10:00:00+05:30");

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "wi-" + Math.random().toString(36).slice(2, 8),
    title: "Test task",
    description: null,
    instructions: null,
    activity_type: "simple",
    status: "pending",
    priority: "medium",
    assigned_user_id: "user-1",
    assigned_by_user_id: null,
    due_at: null,
    available_from: null,
    started_at: null,
    submitted_at: null,
    completed_at: null,
    returned_at: null,
    cancelled_at: null,
    return_reason: null,
    note: null,
    source_module: null,
    source_record_id: null,
    related_project_id: null,
    related_lead_id: null,
    related_label: null,
    checklist_instance_id: null,
    linked_sop_slug: null,
    requires_photo: false,
    requires_note: false,
    requires_approval: false,
    template_id: null,
    scheduled_date: null,
    created_at: "2026-07-10T08:00:00Z",
    updated_at: "2026-07-10T08:00:00Z",
    ...overrides,
  };
}

function makeTplItem(
  overrides: Partial<WorkChecklistTemplateItem> = {},
): WorkChecklistTemplateItem {
  return {
    id: "tpl-" + Math.random().toString(36).slice(2, 8),
    template_id: "tpl-main",
    prompt: "Check something",
    sort_order: 1,
    input_type: "status",
    mandatory: true,
    allow_na: true,
    requires_photo: false,
    requires_photo_on_fail: false,
    requires_corrective_action_on_fail: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isOverdue (PRD test 4)", () => {
  it("is overdue when due_at is past and status is open", () => {
    const item = makeItem({ due_at: "2026-07-11T08:30:00+05:30" });
    expect(isOverdue(item, NOW)).toBe(true);
  });

  it("is NOT overdue when completed, submitted, or cancelled", () => {
    for (const status of ["completed", "submitted", "cancelled"] as const) {
      const item = makeItem({ due_at: "2026-07-11T08:30:00+05:30", status });
      expect(isOverdue(item, NOW)).toBe(false);
    }
  });

  it("is not overdue with a future due date or no due date", () => {
    expect(isOverdue(makeItem({ due_at: "2026-07-11T18:00:00+05:30" }), NOW)).toBe(false);
    expect(isOverdue(makeItem({ due_at: null }), NOW)).toBe(false);
  });
});

describe("sortWorkItems (PRD test 5)", () => {
  it("orders: overdue → returned → priority → due time", () => {
    const overdue = makeItem({ id: "a", due_at: "2026-07-11T08:00:00+05:30" });
    const returned = makeItem({
      id: "b",
      status: "returned",
      due_at: "2026-07-11T18:00:00+05:30",
    });
    const urgent = makeItem({
      id: "c",
      priority: "urgent",
      due_at: "2026-07-11T17:00:00+05:30",
    });
    const earlyDue = makeItem({ id: "d", due_at: "2026-07-11T14:00:00+05:30" });
    const lateDue = makeItem({ id: "e", due_at: "2026-07-11T19:00:00+05:30" });

    const sorted = sortWorkItems([lateDue, earlyDue, urgent, returned, overdue], NOW);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("sinks undated items below dated ones within the same bucket", () => {
    const dated = makeItem({ id: "dated", due_at: "2026-07-11T18:00:00+05:30" });
    const undated = makeItem({ id: "undated" });
    expect(sortWorkItems([undated, dated], NOW)[0].id).toBe("dated");
  });
});

describe("groupWorkItems + summarize", () => {
  it("separates attention / today / upcoming / completed_today", () => {
    const overdue = makeItem({ due_at: "2026-07-11T08:00:00+05:30" });
    const returned = makeItem({ status: "returned" });
    const today = makeItem({ due_at: "2026-07-11T18:00:00+05:30" });
    const upcoming = makeItem({ due_at: "2026-07-13T09:00:00+05:30" });
    const doneToday = makeItem({
      status: "completed",
      completed_at: "2026-07-11T09:00:00+05:30",
    });
    const cancelled = makeItem({ status: "cancelled" });

    const grouped = groupWorkItems(
      [overdue, returned, today, upcoming, doneToday, cancelled],
      NOW,
    );
    expect(grouped.attention).toHaveLength(2);
    expect(grouped.today).toHaveLength(1);
    expect(grouped.upcoming).toHaveLength(1);
    expect(grouped.completed_today).toHaveLength(1);

    const summary = summarize(grouped, NOW);
    expect(summary.overdue).toBe(1);
    expect(summary.completed_today).toBe(1);
  });

  it("keeps undated open items visible in Today", () => {
    const grouped = groupWorkItems([makeItem({ due_at: null })], NOW);
    expect(grouped.today).toHaveLength(1);
  });
});

describe("validateSimpleCompletion (PRD tests 6-8)", () => {
  it("passes with no requirements", () => {
    expect(
      validateSimpleCompletion({
        item: { requires_note: false, requires_photo: false },
        note: null,
        photoCount: 0,
      }),
    ).toHaveLength(0);
  });

  it("blocks completion when a mandatory note is missing", () => {
    const issues = validateSimpleCompletion({
      item: { requires_note: true, requires_photo: false },
      note: "   ",
      photoCount: 0,
    });
    expect(issues.map((i) => i.code)).toContain("note_required");
  });

  it("blocks completion when a mandatory photo is missing", () => {
    const issues = validateSimpleCompletion({
      item: { requires_note: false, requires_photo: true },
      note: "done",
      photoCount: 0,
    });
    expect(issues.map((i) => i.code)).toContain("photo_required");
  });
});

describe("validateChecklistSubmission (PRD test 9)", () => {
  const base = {
    item: { requires_note: false, requires_photo: false },
    note: null,
    itemPhotoCount: 0,
    photosByTemplateItem: {},
  };

  it("blocks submission when a mandatory item is unanswered", () => {
    const tpl = makeTplItem();
    const issues = validateChecklistSubmission({
      ...base,
      templateItems: [tpl],
      responses: [],
    });
    expect(issues.map((i) => i.code)).toContain("item_unanswered");
  });

  it("requires a fail reason and corrective action on Not Completed", () => {
    const tpl = makeTplItem();
    const issues = validateChecklistSubmission({
      ...base,
      templateItems: [tpl],
      responses: [
        {
          template_item_id: tpl.id,
          status: "not_completed",
          text_value: null,
          number_value: null,
          fail_reason: null,
          corrective_action: null,
        },
      ],
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("fail_reason_required");
    expect(codes).toContain("fail_corrective_action_required");
  });

  it("requires a photo on fail when configured", () => {
    const tpl = makeTplItem({ requires_photo_on_fail: true });
    const issues = validateChecklistSubmission({
      ...base,
      templateItems: [tpl],
      responses: [
        {
          template_item_id: tpl.id,
          status: "not_completed",
          text_value: null,
          number_value: null,
          fail_reason: "broken",
          corrective_action: "replace part",
        },
      ],
    });
    expect(issues.map((i) => i.code)).toContain("fail_photo_required");
  });

  it("passes a fully valid submission", () => {
    const tpl = makeTplItem();
    const numberItem = makeTplItem({ input_type: "number" });
    const issues = validateChecklistSubmission({
      ...base,
      templateItems: [tpl, numberItem],
      responses: [
        {
          template_item_id: tpl.id,
          status: "completed",
          text_value: null,
          number_value: null,
          fail_reason: null,
          corrective_action: null,
        },
        {
          template_item_id: numberItem.id,
          status: "completed",
          text_value: null,
          number_value: 85,
          fail_reason: null,
          corrective_action: null,
        },
      ],
    });
    expect(issues).toHaveLength(0);
  });

  it("layers work-item-level photo requirement on top", () => {
    const tpl = makeTplItem();
    const issues = validateChecklistSubmission({
      ...base,
      item: { requires_note: false, requires_photo: true },
      templateItems: [tpl],
      responses: [
        {
          template_item_id: tpl.id,
          status: "completed",
          text_value: null,
          number_value: null,
          fail_reason: null,
          corrective_action: null,
        },
      ],
    });
    expect(issues.map((i) => i.code)).toContain("photo_required");
  });
});

describe("locking + display helpers (PRD test 10)", () => {
  it("isEditable is false once submitted/completed/cancelled", () => {
    expect(isEditable("pending")).toBe(true);
    expect(isEditable("in_progress")).toBe(true);
    expect(isEditable("returned")).toBe(true);
    expect(isEditable("submitted")).toBe(false);
    expect(isEditable("completed")).toBe(false);
    expect(isEditable("cancelled")).toBe(false);
  });

  it("greetingForHour covers the day", () => {
    expect(greetingForHour(8)).toBe("Good Morning");
    expect(greetingForHour(13)).toBe("Good Afternoon");
    expect(greetingForHour(19)).toBe("Good Evening");
  });
});
