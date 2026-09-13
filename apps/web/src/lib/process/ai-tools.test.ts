import { describe, it, expect, vi } from "vitest";
import type { ProcessInstanceView } from "@maiyuri/shared";

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => ({}) },
}));
vi.mock("./engine", () => ({
  getInstanceView: vi.fn(),
  getViewForEntity: vi.fn(),
  listEventsForInstance: vi.fn(),
}));
vi.mock("./repository", () => ({
  getDefinitionView: vi.fn(),
  getLiveInstanceForEntity: vi.fn(),
}));
vi.mock("./work-queue", () => ({ loadWorkQueue: vi.fn() }));

import { composeNextAction, runProcessTool, toolManifest } from "./ai-tools";

function view(over: Partial<ProcessInstanceView> = {}): ProcessInstanceView {
  return {
    instance: {
      id: "inst",
      process_definition_id: "d",
      process_version_id: "v",
      entity_type: "lead",
      entity_id: "lead-1",
      status: "active",
      current_stage_id: "st",
      current_stage_instance_id: "si",
      context: { customer_name: "Kumar", odoo_order_name: "SO1042" },
      imported_existing_case: false,
      import_source: null,
      imported_at: null,
      lock_version: 0,
      started_at: "",
      completed_at: null,
      cancelled_at: null,
      cancel_reason: null,
      created_by: null,
      created_at: "",
      updated_at: "",
    },
    definition: {
      id: "d",
      process_key: "LEAD_TO_DELIVERY",
      name: "Lead to Delivery",
      category: "SALES",
    },
    version: { id: "v", version: "1.0" },
    current_stage: {
      id: "st",
      process_version_id: "v",
      stage_key: "FACTORY_HANDOVER",
      name: "Factory Handover",
      sequence: 9,
      stage_type: "HANDOVER",
      owner_role: "FACTORY_MANAGER",
      sla_minutes: 240,
      is_start: false,
      configuration: {},
      checklist: [],
      gates: [],
      transitions: [],
      description:
        "Factory receives the full package and accepts a feasible plan or returns it with a structured exception.",
    },
    current_stage_instance: {
      id: "si",
      process_instance_id: "inst",
      process_stage_id: "st",
      status: "current",
      assigned_role: "FACTORY_MANAGER",
      assigned_user_id: "rajesh",
      work_item_id: null,
      started_at: "",
      due_at: null,
      sla_warned_at: null,
      sla_breached_at: null,
      completed_at: null,
      completed_by: null,
      blocked_reason: null,
      linked_record: null,
      outcome: null,
      outcome_reason: null,
      created_at: "",
      updated_at: "",
    },
    tasks: [
      {
        id: "t1",
        stage_instance_id: "si",
        checklist_item_id: null,
        item_key: "CHECK_STOCK",
        title: "Check available finished stock",
        description: null,
        status: "open",
        required: true,
        evidence_required: false,
        sequence: 1,
        assigned_user_id: null,
        completed_at: null,
        completed_by: null,
        note: null,
        metadata: {},
        created_at: "",
        updated_at: "",
      },
      {
        id: "t2",
        stage_instance_id: "si",
        checklist_item_id: null,
        item_key: "DELIVERY_DATE",
        title: "Confirm achievable delivery date",
        description: null,
        status: "open",
        required: true,
        evidence_required: false,
        sequence: 2,
        assigned_user_id: null,
        completed_at: null,
        completed_by: null,
        note: null,
        metadata: {},
        created_at: "",
        updated_at: "",
      },
    ],
    gates: [
      {
        gate_key: "ADVANCE_VERIFIED",
        gate_type: "advance_verified",
        status: "ok",
        message: "Verified by finance",
        overridable: false,
      },
      {
        gate_key: "HANDOVER_ACCEPTED",
        gate_type: "handover_accepted",
        status: "fail",
        message: "Waiting for the receiver to accept the handover",
        overridable: false,
      },
    ],
    handover: {
      id: "h",
      process_instance_id: "inst",
      stage_instance_id: "si",
      from_role: "SALES_ENGINEER",
      from_user_id: "srini",
      to_role: "FACTORY_MANAGER",
      to_user_id: "rajesh",
      status: "PENDING",
      payload: {},
      requested_at: "",
      accepted_at: null,
      rejected_at: null,
      rejection_reason_code: null,
      rejection_comment: null,
      proposed_date: null,
      acted_by: null,
      created_at: "",
      updated_at: "",
    },
    evidence: [],
    journey: [],
    available_transitions: [],
    can_act: true,
    ...over,
  };
}

describe("composeNextAction (PRD §16 example)", () => {
  it("states the stage, what is already verified, and what to do — from facts only", () => {
    const next = composeNextAction(view());
    expect(next.summary).toMatch(
      /Kumar \(SO1042\) is at stage 9, Factory Handover \(Factory Manager\)/,
    );
    expect(next.summary).toMatch(/advance verified is confirmed/);
    expect(next.steps[0]).toMatch(/Accept the handover from Sales/);
    expect(next.steps).toContain("Check available finished stock");
    expect(next.steps).toContain("Confirm achievable delivery date");
    expect(next.blockers[0]).toMatch(/handover accepted: Waiting/);
    expect(next.why).toMatch(/feasible plan/);
  });

  it("reports a raised exception and a clean 'complete the stage' when nothing is open", () => {
    const blocked = composeNextAction(
      view({
        instance: { ...view().instance, status: "blocked" },
        current_stage_instance: {
          ...view().current_stage_instance!,
          blocked_reason: {
            code: "RAW_MATERIAL",
            message: "no cement",
            proposed_date: "2026-09-17",
          },
        },
      }),
    );
    expect(blocked.blockers[0]).toMatch(
      /raw material — no cement \(proposed 2026-09-17\)/,
    );
    const clean = composeNextAction(
      view({
        tasks: [],
        gates: [],
        handover: null,
        available_transitions: [
          {
            id: "t",
            process_version_id: "v",
            from_stage_id: "st",
            to_stage_id: "n",
            transition_key: "NEXT",
            condition: {},
            priority: 10,
            is_exception: false,
            label: "Send to factory",
          },
        ],
      }),
    );
    expect(clean.steps).toEqual([
      "Everything is in place — complete the stage (Send to factory).",
    ]);
    expect(clean.blockers).toEqual([]);
  });
});

describe("tool registry", () => {
  it("exposes exactly the PRD §16 tools with input schemas", () => {
    expect(toolManifest().map((t) => t.name)).toEqual([
      "get_process_definition",
      "get_active_process",
      "get_current_process_stage",
      "get_user_process_tasks",
      "get_process_blockers",
      "get_process_handover",
      "explain_next_action",
      "get_process_history",
      "get_process_sla_risks",
    ]);
    expect(
      toolManifest().every((t) => typeof t.input_schema === "object"),
    ).toBe(true);
  });

  it("validates input and rejects unknown tools", async () => {
    await expect(runProcessTool("nope", {}, null)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      runProcessTool(
        "get_process_history",
        { instance_id: "not-a-uuid" },
        null,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      runProcessTool("get_active_process", {}, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("explain_next_action resolves a case by instance id and returns the composed answer", async () => {
    const engine = await import("./engine");
    (
      engine.getInstanceView as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(view());
    const out = (await runProcessTool(
      "explain_next_action",
      { instance_id: "11111111-1111-1111-1111-111111111111" },
      null,
    )) as { summary: string; stage: { name: string } };
    expect(out.stage.name).toBe("Factory Handover");
    expect(out.summary).toMatch(/Factory Handover/);
  });
});
