import { describe, it, expect } from "vitest";
import { validateDefinition } from "./validate-definition";
import { leadToDeliveryV1 } from "./definitions/lead-to-delivery";
import type { ProcessDefinitionInput } from "@maiyuri/shared";

const codes = (v: ReturnType<typeof validateDefinition>) =>
  v.issues.filter((i) => i.severity === "error").map((i) => i.code);

function minimal(
  overrides: Partial<ProcessDefinitionInput> = {},
): ProcessDefinitionInput {
  return {
    process_key: "T",
    name: "Test",
    category: "SALES",
    version: "1.0",
    entity_type: "generic",
    stages: [
      {
        key: "A",
        name: "A",
        type: "ACTION",
        owner_role: "SALES_ENGINEER",
        sla_minutes: 10,
        is_start: true,
        checklist: [],
        gates: [],
        automations: [],
        config: {},
        transitions: [
          {
            key: "NEXT",
            to: "END",
            condition: {},
            priority: 10,
            is_exception: false,
          },
        ],
      },
      {
        key: "END",
        name: "End",
        type: "END",
        owner_role: "SALES_ENGINEER",
        sla_minutes: null,
        is_start: false,
        checklist: [],
        gates: [],
        automations: [],
        config: {},
        transitions: [],
      },
    ],
    ...overrides,
  };
}

describe("validateDefinition", () => {
  it("accepts the reference Lead-to-Delivery definition", () => {
    const v = validateDefinition(leadToDeliveryV1);
    expect(codes(v)).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.definition?.stages.length).toBe(17);
  });

  it("accepts a minimal definition", () => {
    expect(validateDefinition(minimal()).ok).toBe(true);
  });

  it("rejects schema violations (lowercase keys)", () => {
    const v = validateDefinition({ ...minimal(), process_key: "bad key" });
    expect(v.ok).toBe(false);
    expect(v.issues[0].code).toBe("SCHEMA");
    expect(v.definition).toBeNull();
  });

  it("rejects duplicate stage keys", () => {
    const d = minimal();
    d.stages.push({ ...d.stages[0], is_start: false });
    expect(codes(validateDefinition(d))).toContain("DUPLICATE_STAGE_KEY");
  });

  it("rejects missing transition targets", () => {
    const d = minimal();
    d.stages[0].transitions[0].to = "NOWHERE";
    expect(codes(validateDefinition(d))).toContain("MISSING_TRANSITION_TARGET");
  });

  it("rejects unreachable stages", () => {
    const d = minimal();
    d.stages.push({ ...d.stages[0], key: "ORPHAN", is_start: false });
    expect(codes(validateDefinition(d))).toContain("UNREACHABLE_STAGE");
  });

  it("rejects no start stage and multiple start stages", () => {
    const none = minimal();
    none.stages[0].is_start = false;
    expect(codes(validateDefinition(none))).toContain("NO_START_STAGE");
    const many = minimal();
    many.stages[1].is_start = true;
    expect(codes(validateDefinition(many))).toContain("MULTIPLE_START_STAGES");
  });

  it("rejects an invalid owner role at the schema level", () => {
    const d = minimal();
    (d.stages[0] as unknown as { owner_role: string }).owner_role = "JANITOR";
    const v = validateDefinition(d);
    expect(v.ok).toBe(false);
    expect(
      v.issues.some(
        (i) => i.code === "SCHEMA" && i.path?.includes("owner_role"),
      ),
    ).toBe(true);
  });

  it("rejects circular normal transitions but allows exception loops", () => {
    const d = minimal();
    d.stages.splice(1, 0, {
      key: "B",
      name: "B",
      type: "ACTION",
      owner_role: "SALES_ENGINEER",
      sla_minutes: 10,
      is_start: false,
      checklist: [],
      gates: [],
      automations: [],
      config: {},
      transitions: [
        {
          key: "NEXT",
          to: "END",
          condition: {},
          priority: 10,
          is_exception: false,
        },
        {
          key: "BACK",
          to: "A",
          condition: {},
          priority: 20,
          is_exception: false,
        },
      ],
    });
    d.stages[0].transitions[0].to = "B";
    expect(codes(validateDefinition(d))).toContain("CIRCULAR_TRANSITIONS");
    d.stages[1].transitions[1].is_exception = true;
    expect(codes(validateDefinition(d))).not.toContain("CIRCULAR_TRANSITIONS");
    expect(validateDefinition(d).ok).toBe(true);
  });

  it("rejects transitions that reference undefined gates", () => {
    const d = minimal();
    d.stages[0].transitions[0].condition = { gates: ["GHOST"] };
    expect(codes(validateDefinition(d))).toContain("MISSING_GATE_REFERENCE");
  });

  it("rejects END stages with transitions and non-END dead ends", () => {
    const d = minimal();
    d.stages[1].transitions.push({
      key: "X",
      to: "A",
      condition: {},
      priority: 10,
      is_exception: false,
    });
    expect(codes(validateDefinition(d))).toContain("END_HAS_TRANSITIONS");
    const dead = minimal();
    dead.stages[0].transitions = [];
    expect(codes(validateDefinition(dead))).toContain("DEAD_END");
  });

  it("requires DECISION stages to declare outcomes and map each to a transition", () => {
    const d = minimal();
    d.stages[0].type = "DECISION";
    d.stages[0].config = { outcomes: ["GO", "STOP"] };
    d.stages[0].transitions = [
      {
        key: "GO",
        to: "END",
        condition: { outcome: "GO" },
        priority: 10,
        is_exception: false,
      },
    ];
    const c = codes(validateDefinition(d));
    expect(c).toContain("OUTCOME_WITHOUT_TRANSITION");
    d.stages[0].config = {};
    expect(codes(validateDefinition(d))).toContain("DECISION_WITHOUT_OUTCOMES");
  });

  it("rejects non-DECISION stages with more than one normal transition", () => {
    const d = minimal();
    d.stages[0].transitions.push({
      key: "ALSO",
      to: "END",
      condition: {},
      priority: 20,
      is_exception: false,
    });
    expect(codes(validateDefinition(d))).toContain("AMBIGUOUS_NEXT");
  });

  it("requires HANDOVER stages to have an accepted gate and a return path", () => {
    const d = minimal();
    d.stages[0].type = "HANDOVER";
    const c = codes(validateDefinition(d));
    expect(c).toContain("HANDOVER_WITHOUT_GATE");
    expect(c).toContain("HANDOVER_WITHOUT_RETURN");
  });

  it("warns (does not fail) on missing SLA", () => {
    const d = minimal();
    d.stages[0].sla_minutes = null;
    const v = validateDefinition(d);
    expect(v.ok).toBe(true);
    expect(
      v.issues.some((i) => i.code === "NO_SLA" && i.severity === "warning"),
    ).toBe(true);
  });
});
