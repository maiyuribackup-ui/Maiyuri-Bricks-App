import { describe, it, expect } from "vitest";
import type {
  ProcessGateResult,
  ProcessInstanceView,
  ProcessTaskRow,
} from "@maiyuri/shared";
import { deriveNextAction, describeDue, journeyProgress } from "./next-action";

function task(
  over: Partial<ProcessTaskRow> & { title: string; sequence: number },
): ProcessTaskRow {
  return {
    id: over.title,
    stage_instance_id: "si",
    checklist_item_id: null,
    item_key: over.title,
    description: null,
    status: "open",
    required: true,
    evidence_required: false,
    assigned_user_id: null,
    completed_at: null,
    completed_by: null,
    note: null,
    metadata: {},
    created_at: "",
    updated_at: "",
    ...over,
  } as ProcessTaskRow;
}

function gate(over: Partial<ProcessGateResult>): ProcessGateResult {
  return {
    gate_key: "G",
    gate_type: "checklist_complete",
    status: "ok",
    message: null,
    overridable: true,
    ...over,
  };
}

function view(over: Partial<ProcessInstanceView> = {}): ProcessInstanceView {
  return {
    instance: { status: "active", cancel_reason: null } as never,
    definition: { id: "d", process_key: "P", name: "P", category: "SALES" },
    version: { id: "v", version: "1.1" },
    current_stage: {
      id: "s",
      name: "Quotation",
      stage_type: "ACTION",
      owner_role: "SALES_ENGINEER",
    } as never,
    current_stage_instance: { due_at: null, blocked_reason: null } as never,
    tasks: [],
    gates: [],
    handover: null,
    evidence: [],
    journey: [],
    available_transitions: [],
    can_act: true,
    ...over,
  };
}

describe("deriveNextAction", () => {
  it("points at the first open required checklist item", () => {
    const a = deriveNextAction(
      view({
        tasks: [
          task({ title: "Second", sequence: 2 }),
          task({ title: "First", sequence: 1, evidence_required: true }),
          task({ title: "Optional", sequence: 0, required: false }),
        ],
      }),
    );
    expect(a.kind).toBe("task");
    expect(a.title).toBe("First");
    expect(a.taskId).toBe("First");
    expect(a.openRequired).toBe(2);
    expect(a.detail).toMatch(/Attach evidence/);
  });

  it("names the failing gate once the checklist is done", () => {
    const a = deriveNextAction(
      view({
        gates: [
          gate({ status: "ok" }),
          gate({
            gate_key: "QUOTE_EXISTS",
            gate_type: "odoo_quote_linked",
            status: "fail",
            message: "No Odoo quotation linked",
            overridable: false,
          }),
        ],
      }),
    );
    expect(a.kind).toBe("gate");
    expect(a.title).toBe("No Odoo quotation linked");
    expect(a.gateKey).toBe("QUOTE_EXISTS");
    expect(a.detail).toMatch(/cannot be overridden/);
  });

  it("asks for a decision on decision gates and says ready when clear", () => {
    expect(
      deriveNextAction(
        view({
          gates: [
            gate({
              gate_type: "decision_outcome",
              status: "fail",
              message: "Choose an outcome",
            }),
          ],
        }),
      ).kind,
    ).toBe("decision");
    const ready = deriveNextAction(view({ gates: [gate({ status: "ok" })] }));
    expect(ready.kind).toBe("ready");
    expect(ready.canComplete).toBe(true);
  });

  it("blocked, handover and terminal states win over the checklist", () => {
    expect(
      deriveNextAction(
        view({
          instance: { status: "blocked" } as never,
          current_stage_instance: {
            blocked_reason: { code: "X", message: "Stock short" },
          } as never,
          tasks: [task({ title: "T", sequence: 1 })],
        }),
      ),
    ).toMatchObject({ kind: "blocked", detail: "Stock short" });
    expect(
      deriveNextAction(
        view({
          current_stage: {
            stage_type: "HANDOVER",
            owner_role: "FACTORY_MANAGER",
            name: "H",
          } as never,
          handover: { status: "PENDING" } as never,
        }),
      ).kind,
    ).toBe("handover");
    expect(
      deriveNextAction(view({ instance: { status: "completed" } as never }))
        .kind,
    ).toBe("done");
    expect(
      deriveNextAction(
        view({
          instance: { status: "cancelled", cancel_reason: "lost" } as never,
        }),
      ),
    ).toMatchObject({ kind: "cancelled", detail: "lost" });
  });
});

describe("journeyProgress + describeDue", () => {
  it("counts completed non-END stages", () => {
    const v = view({
      journey: [
        { stage_type: "ACTION", status: "completed" },
        { stage_type: "ACTION", status: "current" },
        { stage_type: "ACTION", status: "upcoming" },
        { stage_type: "END", status: "upcoming" },
      ] as never,
    });
    expect(journeyProgress(v)).toEqual({ done: 1, total: 3, percent: 33 });
  });

  it("describes due times in minutes, hours and days, and flags overdue", () => {
    const now = new Date("2026-09-13T10:00:00Z");
    expect(describeDue("2026-09-13T10:30:00Z", now)).toEqual({
      label: "Due in 30 min",
      overdue: false,
    });
    expect(describeDue("2026-09-13T15:00:00Z", now)).toEqual({
      label: "Due in 5 h",
      overdue: false,
    });
    expect(describeDue("2026-09-11T10:00:00Z", now)).toEqual({
      label: "Overdue by 2 d",
      overdue: true,
    });
    expect(describeDue(null, now)).toBeNull();
  });
});
