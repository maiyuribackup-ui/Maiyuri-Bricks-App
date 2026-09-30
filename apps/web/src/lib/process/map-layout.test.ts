import { describe, it, expect } from "vitest";
import type { ProcessStageView } from "@maiyuri/shared";
import {
  LANE_H,
  LANE_GAP,
  LANE_LABEL_W,
  buildFlowGraph,
  describeLoad,
  lanesIn,
} from "./map-layout";

function stage(
  key: string,
  sequence: number,
  owner: ProcessStageView["owner_role"],
  transitions: { to: string; exception?: boolean; label?: string }[] = [],
  type: ProcessStageView["stage_type"] = "ACTION",
): ProcessStageView {
  return {
    id: key,
    process_version_id: "v",
    stage_key: key,
    name: key,
    description: null,
    stage_type: type,
    owner_role: owner,
    sla_minutes: 60,
    is_start: sequence === 1,
    sequence,
    configuration: {},
    checklist: [],
    gates: [],
    transitions: transitions.map((t, i) => ({
      id: `${key}-${i}`,
      from_stage_id: key,
      to_stage_id: t.to,
      transition_key: `T${i}`,
      condition: {},
      priority: i,
      is_exception: t.exception ?? false,
      label: t.label ?? null,
    })),
  } as ProcessStageView;
}

const STAGES: ProcessStageView[] = [
  stage("LEAD", 1, "SALES_ENGINEER", [{ to: "QUOTE" }]),
  stage("QUOTE", 2, "SALES_ENGINEER", [{ to: "ADVANCE" }]),
  stage("ADVANCE", 3, "FINANCE", [
    { to: "FACTORY" },
    { to: "QUOTE", exception: true, label: "Payment pending" },
  ]),
  stage("FACTORY", 4, "FACTORY_MANAGER", [{ to: "DONE" }], "HANDOVER"),
  stage("DONE", 5, "SALES_ENGINEER", [], "END"),
];

describe("map layout", () => {
  it("only creates lanes for roles the definition uses, in fixed order", () => {
    expect(lanesIn(STAGES).map((l) => l.label)).toEqual([
      "Sales",
      "Finance",
      "Factory",
    ]);
  });

  it("places every stage in its owner's lane and orders columns along the flow", () => {
    const g = buildFlowGraph(STAGES, null, null);
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    const laneY = (i: number) => i * (LANE_H + LANE_GAP);
    expect(byId.LEAD.position.y).toBeGreaterThanOrEqual(laneY(0));
    expect(byId.LEAD.position.y).toBeLessThan(laneY(1));
    expect(byId.ADVANCE.position.y).toBeGreaterThanOrEqual(laneY(1));
    expect(byId.ADVANCE.position.y).toBeLessThan(laneY(2));
    expect(byId.FACTORY.position.y).toBeGreaterThanOrEqual(laneY(2));
    // Flow order left → right.
    expect(byId.LEAD.position.x).toBeLessThan(byId.QUOTE.position.x);
    expect(byId.QUOTE.position.x).toBeLessThan(byId.ADVANCE.position.x);
    expect(byId.ADVANCE.position.x).toBeLessThan(byId.FACTORY.position.x);
    expect(byId.FACTORY.position.x).toBeLessThan(byId.DONE.position.x);
    expect(byId.LEAD.position.x).toBeGreaterThanOrEqual(LANE_LABEL_W);
    expect(g.lanes).toHaveLength(3);
    expect(g.height).toBe(3 * (LANE_H + LANE_GAP));
  });

  it("keeps exception returns as edges but out of the column ordering", () => {
    const g = buildFlowGraph(STAGES, null, null);
    const back = g.edges.find(
      (e) => e.source === "ADVANCE" && e.target === "QUOTE",
    );
    expect(back?.data.exception).toBe(true);
    expect(back?.data.label).toBe("Payment pending");
    expect(g.edges.filter((e) => !e.data.exception)).toHaveLength(4);
  });

  it("attaches live stats by stage key and marks the selected node", () => {
    const stats = {
      process_key: "X",
      as_of: "",
      total_open: 2,
      total_overdue: 1,
      total_blocked: 0,
      stages: {
        QUOTE: {
          stage_key: "QUOTE",
          open: 2,
          blocked: 0,
          overdue: 1,
          cases: [],
        },
      },
    };
    const g = buildFlowGraph(STAGES, stats, "QUOTE");
    const quote = g.nodes.find((n) => n.id === "QUOTE")!;
    expect(quote.data.stats?.open).toBe(2);
    expect(quote.data.selected).toBe(true);
    expect(g.nodes.find((n) => n.id === "LEAD")!.data.stats).toBeNull();
  });

  it("describes load in plain words", () => {
    expect(describeLoad(null)).toBe("No live cases");
    expect(
      describeLoad({
        stage_key: "A",
        open: 3,
        blocked: 1,
        overdue: 2,
        cases: [],
      }),
    ).toBe("3 live · 2 overdue · 1 blocked");
  });
});
