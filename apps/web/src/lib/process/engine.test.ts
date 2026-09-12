/**
 * Engine orchestration tests. The database owns the state machine (covered by
 * supabase/tests/process_os); these cover what the TypeScript layer adds:
 * external gate evaluation before the RPC, gate_failed auditing, permission
 * pre-checks, stale-stage detection and event dispatch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ProcessGateRow,
  ProcessInstanceRow,
  ProcessStageInstanceRow,
  ProcessStageView,
} from "@maiyuri/shared";

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcImpl: (
  fn: string,
  args: Record<string, unknown>,
) => unknown = () => ({});
const inserted: { table: string; row: Record<string, unknown> }[] = [];
const dispatched: string[] = [];

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of [
        "select",
        "eq",
        "in",
        "is",
        "order",
        "limit",
        "update",
        "maybeSingle",
      ])
        chain[m] = () => chain;
      chain.single = () =>
        Promise.resolve({
          data: {
            id: "def",
            process_key: "T",
            name: "Test",
            category: "SALES",
          },
          error: null,
        });
      chain.insert = (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      };
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return chain;
    },
  },
}));

vi.mock("./events", () => ({
  dispatchPendingEvents: async (id: string) => {
    dispatched.push(id);
    return 0;
  },
}));

const instance: ProcessInstanceRow = {
  id: "inst",
  process_definition_id: "def",
  process_version_id: "ver",
  entity_type: "generic",
  entity_id: "e1",
  status: "active",
  current_stage_id: "st",
  current_stage_instance_id: "si",
  context: { odoo_order_id: 42 },
  imported_existing_case: false,
  import_source: null,
  imported_at: null,
  lock_version: 0,
  started_at: "",
  completed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_by: "srini",
  created_at: "",
  updated_at: "",
};
const stageInstance: ProcessStageInstanceRow = {
  id: "si",
  process_instance_id: "inst",
  process_stage_id: "st",
  status: "current",
  assigned_role: "FINANCE",
  assigned_user_id: "acc",
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
};
const advanceGate: ProcessGateRow = {
  id: "g1",
  stage_id: "st",
  gate_key: "ADVANCE_VERIFIED",
  gate_type: "advance_verified",
  condition: { min_percent: 30, auto_from_odoo: true },
  failure_message: "Advance is not verified",
  overridable: false,
};
const checklistGate: ProcessGateRow = {
  id: "g0",
  stage_id: "st",
  gate_key: "CHECKLIST",
  gate_type: "checklist_complete",
  condition: {},
  failure_message: null,
  overridable: true,
};
const stage: ProcessStageView = {
  id: "st",
  process_version_id: "ver",
  stage_key: "ADVANCE",
  name: "Advance",
  description: null,
  stage_type: "ACTION",
  sequence: 7,
  owner_role: "FINANCE",
  sla_minutes: 60,
  is_start: false,
  configuration: {},
  checklist: [],
  gates: [checklistGate, advanceGate],
  transitions: [
    {
      id: "t",
      process_version_id: "ver",
      from_stage_id: "st",
      to_stage_id: "next",
      transition_key: "NEXT",
      condition: {},
      priority: 10,
      is_exception: false,
      label: null,
    },
  ],
};

let stages: ProcessStageView[] = [stage];

vi.mock("./repository", () => ({
  rpc: (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcImpl(fn, args));
  },
  requireInstance: async () => instance,
  getInstance: async () => instance,
  getVersion: async () => ({ id: "ver", version: "1.0" }),
  getVersionStages: async () => stages,
  listStageInstances: async () => [stageInstance],
  listTasks: async () => [],
  listEvidence: async () => [],
  getLatestHandover: async () => null,
  listOverriddenGates: async () => new Set<string>(),
  getLeadForPermission: async () => null,
  getStageInstance: async () => stageInstance,
  listEvents: async () => [],
}));

import { advance, getInstanceView } from "./engine";
import { ProcessError } from "./errors";

const finance = { id: "acc", email: "a@x", role: "accountant" as const };
const sales = { id: "srini", email: "s@x", role: "sales" as const };

beforeEach(() => {
  rpcCalls.length = 0;
  inserted.length = 0;
  dispatched.length = 0;
  rpcImpl = () => ({});
  stages = [stage];
});

describe("advance", () => {
  it("evaluates external gates first; a failing gate is audited and the RPC is never called", async () => {
    const sources = {
      payment: async () => ({
        order_total: 1000,
        paid_amount: 100,
        paid_percent: 10,
        invoice_count: 1,
      }),
    };
    const err = await advance(
      "inst",
      finance,
      { expected_stage_instance_id: "si" },
      { sources, silent: true },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ProcessError);
    expect(err.code).toBe("GATE_FAILED");
    expect(err.gateKey).toBe("ADVANCE_VERIFIED");
    expect(err.status).toBe(422);
    expect(rpcCalls.find((c) => c.fn === "process_advance")).toBeUndefined();
    expect(
      inserted.some(
        (i) =>
          i.table === "process_events" &&
          i.row.event_type === "process.gate_failed",
      ),
    ).toBe(true);
  });

  it("an Odoo failure turns the gate unknown and still blocks (fails closed)", async () => {
    const sources = {
      payment: async () => {
        throw new Error("Odoo timeout");
      },
    };
    const err = await advance(
      "inst",
      finance,
      { expected_stage_instance_id: "si" },
      { sources, silent: true },
    ).catch((e) => e);
    expect(err.code).toBe("GATE_FAILED");
    expect(err.message).toMatch(/Odoo timeout/);
  });

  it("passes gate results to the database and dispatches events on success", async () => {
    const sources = {
      payment: async () => ({
        order_total: 1000,
        paid_amount: 500,
        paid_percent: 50,
        invoice_count: 1,
      }),
    };
    await advance(
      "inst",
      finance,
      { expected_stage_instance_id: "si" },
      { sources },
    );
    const call = rpcCalls.find((c) => c.fn === "process_advance");
    expect(call).toBeDefined();
    expect(call?.args.p_gate_results).toEqual({
      CHECKLIST: "ok",
      ADVANCE_VERIFIED: "ok",
    });
    expect(call?.args.p_actor).toBe("acc");
    expect(dispatched).toContain("inst");
  });

  it("refuses a user without the stage role before touching the database (Scenario D)", async () => {
    const err = await advance(
      "inst",
      sales,
      { expected_stage_instance_id: "si" },
      { silent: true },
    ).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("detects a stale stage instance id", async () => {
    const err = await advance(
      "inst",
      finance,
      { expected_stage_instance_id: "old" },
      { silent: true },
    ).catch((e) => e);
    expect(err.code).toBe("STALE_STAGE");
    expect(err.status).toBe(409);
  });

  it("skips gates on an exception transition", async () => {
    const sources = {
      payment: async () => {
        throw new Error("down");
      },
    };
    stages = [
      {
        ...stage,
        transitions: [
          ...stage.transitions,
          {
            ...stage.transitions[0],
            id: "x",
            transition_key: "PAYMENT_PENDING",
            is_exception: true,
          },
        ],
      },
    ];
    await advance(
      "inst",
      finance,
      { expected_stage_instance_id: "si", transition_key: "PAYMENT_PENDING" },
      { sources, silent: true },
    );
    const call = rpcCalls.find((c) => c.fn === "process_advance");
    expect(call?.args.p_transition_key).toBe("PAYMENT_PENDING");
    expect(call?.args.p_gate_results).toEqual({});
  });

  it("records the gate the database rejected when the RPC raises GATE_FAILED", async () => {
    rpcImpl = (fn) => {
      if (fn === "process_advance")
        throw new ProcessError(
          "GATE_FAILED",
          "Advance is not verified",
          422,
          "ADVANCE_VERIFIED",
        );
      return {};
    };
    const sources = {
      payment: async () => ({
        order_total: 1000,
        paid_amount: 500,
        paid_percent: 50,
        invoice_count: 1,
      }),
    };
    const err = await advance(
      "inst",
      finance,
      { expected_stage_instance_id: "si" },
      { sources, silent: true },
    ).catch((e) => e);
    expect(err.code).toBe("GATE_FAILED");
    expect(
      inserted.some((i) => i.row.event_type === "process.gate_failed"),
    ).toBe(true);
  });
});

describe("getInstanceView", () => {
  it("returns the journey with the current stage marked and gate results for the caller", async () => {
    const sources = {
      payment: async () => ({
        order_total: 1000,
        paid_amount: 0,
        paid_percent: 0,
        invoice_count: 0,
      }),
    };
    const view = await getInstanceView("inst", finance, { sources });
    expect(view.journey).toHaveLength(1);
    expect(view.journey[0].status).toBe("current");
    expect(view.gates.map((g) => g.status)).toEqual(["ok", "fail"]);
    expect(view.can_act).toBe(true);
    const asSales = await getInstanceView("inst", sales, { sources });
    expect(asSales.can_act).toBe(false);
  });
});
