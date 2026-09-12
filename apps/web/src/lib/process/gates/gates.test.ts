import { describe, it, expect } from "vitest";
import type { ProcessGateRow, ProcessTaskRow } from "@maiyuri/shared";
import {
  emptyFacts,
  evaluateGate,
  evaluateGates,
  firstBlockingGate,
  gateResultsPayload,
  type GateFacts,
} from "./index";

function gate(
  type: ProcessGateRow["gate_type"],
  condition: Record<string, unknown> = {},
  extra: Partial<ProcessGateRow> = {},
): ProcessGateRow {
  return {
    id: "g",
    stage_id: "s",
    gate_key: type.toUpperCase(),
    gate_type: type,
    condition,
    failure_message: null,
    overridable: true,
    ...extra,
  };
}
function task(
  required: boolean,
  status: ProcessTaskRow["status"],
): ProcessTaskRow {
  return {
    id: Math.random().toString(),
    stage_instance_id: "si",
    checklist_item_id: null,
    item_key: "K",
    title: "t",
    description: null,
    status,
    required,
    evidence_required: false,
    sequence: 1,
    assigned_user_id: null,
    completed_at: null,
    completed_by: null,
    note: null,
    metadata: {},
    created_at: "",
    updated_at: "",
  };
}
function evidence(type: string, role: string | null) {
  return {
    id: Math.random().toString(),
    process_instance_id: "i",
    stage_instance_id: "si",
    task_id: null,
    evidence_type: type as never,
    source_type: "text" as const,
    source_id: null,
    path: null,
    metadata: {},
    added_by: "u",
    added_at: "",
    added_by_role: role,
  };
}
const facts = (over: Partial<GateFacts> = {}): GateFacts => ({
  ...emptyFacts(),
  ...over,
});

describe("checklist_complete", () => {
  it("passes when every required task is done or n/a", () => {
    const f = facts({
      tasks: [task(true, "done"), task(true, "na"), task(false, "open")],
    });
    expect(evaluateGate(gate("checklist_complete"), f).status).toBe("ok");
  });
  it("fails while a required task is open", () => {
    const f = facts({ tasks: [task(true, "open")] });
    const r = evaluateGate(gate("checklist_complete"), f);
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/1 required item/);
  });
});

describe("entity_field", () => {
  it("supports exists / not_null / in / not_in / eq", () => {
    const f = facts({
      entity: {
        id: "x",
        pipeline_stage: "quote_shared",
        odoo_order_id: null,
        lead_status: "connected",
      },
    });
    expect(
      evaluateGate(gate("entity_field", { field: "id", exists: true }), f)
        .status,
    ).toBe("ok");
    expect(
      evaluateGate(
        gate("entity_field", { field: "odoo_order_id", not_null: true }),
        f,
      ).status,
    ).toBe("fail");
    expect(
      evaluateGate(
        gate("entity_field", {
          field: "pipeline_stage",
          in: ["quote_shared", "finalisation"],
        }),
        f,
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(
        gate("entity_field", {
          field: "lead_status",
          not_in: ["new_contact_pending"],
        }),
        f,
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(
        gate("entity_field", { field: "lead_status", eq: "closed" }),
        f,
      ).status,
    ).toBe("fail");
  });
  it("is unknown when the entity could not be loaded, fails when it does not exist", () => {
    expect(
      evaluateGate(
        gate("entity_field", { field: "id", exists: true }),
        facts({ errors: { entity: "boom" } }),
      ).status,
    ).toBe("unknown");
    expect(
      evaluateGate(
        gate("entity_field", { field: "id", exists: true }),
        facts({ entity: null }),
      ).status,
    ).toBe("fail");
  });
});

describe("advance_verified", () => {
  const g = gate(
    "advance_verified",
    { min_percent: 30 },
    { overridable: false },
  );
  it("passes only when FINANCE attached the payment reference", () => {
    expect(
      evaluateGate(
        g,
        facts({ evidence: [evidence("payment_reference", "accountant")] }),
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(
        g,
        facts({ evidence: [evidence("payment_reference", "founder")] }),
      ).status,
    ).toBe("ok");
    const sales = evaluateGate(
      g,
      facts({ evidence: [evidence("payment_reference", "sales")] }),
    );
    expect(sales.status).toBe("fail");
    expect(sales.message).toMatch(/Finance/);
    expect(evaluateGate(g, facts()).status).toBe("fail");
  });
  it("uses Odoo when auto_from_odoo is on and fails closed on errors", () => {
    const auto = gate("advance_verified", {
      min_percent: 30,
      auto_from_odoo: true,
    });
    expect(
      evaluateGate(
        auto,
        facts({
          payment: {
            order_total: 1000,
            paid_amount: 400,
            paid_percent: 40,
            invoice_count: 1,
          },
        }),
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(
        auto,
        facts({
          payment: {
            order_total: 1000,
            paid_amount: 100,
            paid_percent: 10,
            invoice_count: 1,
          },
        }),
      ).status,
    ).toBe("fail");
    expect(
      evaluateGate(auto, facts({ errors: { payment: "timeout" } })).status,
    ).toBe("unknown");
    expect(evaluateGate(auto, facts()).status).toBe("unknown");
  });
});

describe("stock_feasible", () => {
  const g = gate("stock_feasible", { as_of: "requested_delivery_date" });
  it("passes when fully ready, fails with detail when short, unknown without demand or on error", () => {
    expect(
      evaluateGate(
        g,
        facts({
          stock: {
            has_demand: true,
            lines: [],
            as_of: "2026-09-14",
            fully_ready: true,
          },
        }),
      ).status,
    ).toBe("ok");
    const short = evaluateGate(
      g,
      facts({
        stock: {
          has_demand: true,
          as_of: "2026-09-14",
          fully_ready: false,
          lines: [
            {
              so_line_id: "l",
              product_name: "8 inch",
              remaining: 18500,
              ready_now: 9000,
              ready_from: "2026-09-17",
              uncovered: 0,
            },
          ],
        },
      }),
    );
    expect(short.status).toBe("fail");
    expect(short.message).toMatch(/8 inch: 9000\/18500/);
    expect(
      evaluateGate(
        g,
        facts({
          stock: {
            has_demand: false,
            lines: [],
            as_of: "x",
            fully_ready: false,
          },
        }),
      ).status,
    ).toBe("unknown");
    expect(
      evaluateGate(g, facts({ errors: { stock: "db down" } })).status,
    ).toBe("unknown");
  });
});

describe("manual_confirmation", () => {
  const g = gate("manual_confirmation", {
    role: "FACTORY_MANAGER",
    evidence_type: "qc_release",
  });
  it("requires the evidence from the named role", () => {
    expect(
      evaluateGate(
        g,
        facts({ evidence: [evidence("qc_release", "production_supervisor")] }),
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(g, facts({ evidence: [evidence("qc_release", "owner")] }))
        .status,
    ).toBe("ok");
    expect(
      evaluateGate(g, facts({ evidence: [evidence("qc_release", "sales")] }))
        .status,
    ).toBe("fail");
    expect(
      evaluateGate(
        g,
        facts({ evidence: [evidence("photo", "production_supervisor")] }),
      ).status,
    ).toBe("fail");
  });
});

describe("handover_accepted / linked_record_status / decision_outcome", () => {
  const ho = (status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED") => ({
    id: "h",
    process_instance_id: "i",
    stage_instance_id: "si",
    from_role: "SALES_ENGINEER" as const,
    from_user_id: null,
    to_role: "FACTORY_MANAGER" as const,
    to_user_id: null,
    status,
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
  });
  it("handover must be ACCEPTED", () => {
    expect(
      evaluateGate(
        gate("handover_accepted"),
        facts({ handover: ho("ACCEPTED") }),
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(
        gate("handover_accepted"),
        facts({ handover: ho("PENDING") }),
      ).status,
    ).toBe("fail");
    expect(evaluateGate(gate("handover_accepted"), facts()).status).toBe(
      "fail",
    );
  });
  it("linked record status", () => {
    const g = gate("linked_record_status", {
      type: "delivery",
      status: "delivered",
    });
    expect(
      evaluateGate(
        g,
        facts({
          linked_record: { type: "delivery", id: "d", status: "delivered" },
        }),
      ).status,
    ).toBe("ok");
    expect(
      evaluateGate(
        g,
        facts({
          linked_record: { type: "delivery", id: "d", status: "in_transit" },
        }),
      ).status,
    ).toBe("fail");
    expect(
      evaluateGate(
        g,
        facts({ linked_record: { type: "delivery", id: "d", status: null } }),
      ).status,
    ).toBe("unknown");
    expect(evaluateGate(g, facts()).status).toBe("fail");
    expect(
      evaluateGate(
        gate("linked_record_status", {
          type: "delivery",
          status: "delivered",
          optional: true,
        }),
        facts(),
      ).status,
    ).toBe("ok");
  });
  it("decision outcome", () => {
    const g = gate("decision_outcome", { in: ["GO", "NO"] });
    expect(evaluateGate(g, facts({ outcome: "GO" })).status).toBe("ok");
    expect(evaluateGate(g, facts({ outcome: "MAYBE" })).status).toBe("fail");
    expect(evaluateGate(g, facts()).status).toBe("fail");
  });
});

describe("overrides, payload and blocking", () => {
  it("an overridden gate reports overridden and is sent as ok", () => {
    const g = gate("advance_verified", {});
    const results = evaluateGates(
      [g, gate("checklist_complete")],
      facts({ overridden: new Set(["ADVANCE_VERIFIED"]) }),
    );
    expect(results[0].status).toBe("overridden");
    expect(gateResultsPayload(results)).toEqual({
      ADVANCE_VERIFIED: "ok",
      CHECKLIST_COMPLETE: "ok",
    });
    expect(firstBlockingGate(results)).toBeNull();
  });
  it("uses the configured failure message and reports the first blocker", () => {
    const g = gate(
      "advance_verified",
      {},
      { failure_message: "Advance not verified" },
    );
    const results = evaluateGates([gate("checklist_complete"), g], facts());
    expect(firstBlockingGate(results)?.gate_key).toBe("ADVANCE_VERIFIED");
    expect(firstBlockingGate(results)?.message).toMatch(
      /^Advance not verified/,
    );
  });
});
