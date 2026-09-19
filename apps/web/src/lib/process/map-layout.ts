/**
 * Swimlane layout for the Process Map (pure, testable).
 *
 * Stages sit in the lane of the role that owns them; x follows the flow
 * (dagre, left → right on the normal transitions only, so exception returns
 * never bend the main line backwards). Two stages that land on the same
 * column in the same lane are staggered so nothing overlaps.
 */
import dagre from "@dagrejs/dagre";
import {
  PROCESS_LANES,
  processLaneFor,
  type ProcessDefinitionStats,
  type ProcessLaneStyle,
  type ProcessStageLiveStats,
  type ProcessStageType,
  type ProcessStageView,
} from "@maiyuri/shared";

export const NODE_W = 208;
export const NODE_H = 96;
export const LANE_H = 150;
export const LANE_GAP = 12;
export const LANE_LABEL_W = 112;
const COL_GAP = 56;

export type LaneStyle = ProcessLaneStyle;
export const LANES = PROCESS_LANES;
export const laneFor = processLaneFor;

/** Stage-type accents layered over the lane hue. */
export const STAGE_TYPE_STYLE: Record<
  ProcessStageType,
  {
    label: string;
    hue: string;
    wash: string;
    shape: "card" | "diamond" | "pill";
  }
> = {
  ACTION: { label: "Action", hue: "#334155", wash: "#f1f5f9", shape: "card" },
  DECISION: {
    label: "Decision",
    hue: "#b45309",
    wash: "#fef3c7",
    shape: "diamond",
  },
  HANDOVER: {
    label: "Handover",
    hue: "#0369a1",
    wash: "#e0f2fe",
    shape: "card",
  },
  WAIT: { label: "Waiting", hue: "#6b7280", wash: "#f3f4f6", shape: "card" },
  AUTOMATION: {
    label: "Automatic",
    hue: "#7c3aed",
    wash: "#ede9fe",
    shape: "card",
  },
  END: { label: "End", hue: "#15803d", wash: "#dcfce7", shape: "pill" },
};

export interface FlowNodeData {
  stage: ProcessStageView;
  index: number;
  lane: LaneStyle;
  stats: ProcessStageLiveStats | null;
  selected: boolean;
  [key: string]: unknown;
}

export interface FlowEdgeData {
  label: string | null;
  exception: boolean;
  outcome: string | null;
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: "stage";
  position: { x: number; y: number };
  data: FlowNodeData;
  width: number;
  height: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type: "flow";
  data: FlowEdgeData;
}

export interface LaneBand {
  lane: LaneStyle;
  y: number;
  height: number;
  stageCount: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  lanes: LaneBand[];
  width: number;
  height: number;
}

/** Lanes in fixed order, only those the definition actually uses. */
export function lanesIn(stages: ProcessStageView[]): LaneStyle[] {
  const used = new Set(stages.map((s) => s.owner_role));
  return LANES.filter((l) => used.has(l.key));
}

function columnsByDagre(stages: ProcessStageView[]): Map<string, number> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 20, ranksep: COL_GAP, marginx: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of stages) g.setNode(s.id, { width: NODE_W, height: NODE_H });
  for (const s of stages)
    for (const t of s.transitions)
      if (!t.is_exception && t.to_stage_id !== s.id)
        g.setEdge(s.id, t.to_stage_id);
  dagre.layout(g);
  // dagre gives x centres; collapse them into integer columns.
  const xs = [
    ...new Set(stages.map((s) => Math.round(g.node(s.id)?.x ?? 0))),
  ].sort((a, b) => a - b);
  const col = new Map<number, number>();
  xs.forEach((x, i) => col.set(x, i));
  const out = new Map<string, number>();
  for (const s of stages)
    out.set(s.id, col.get(Math.round(g.node(s.id)?.x ?? 0)) ?? 0);
  return out;
}

export function buildFlowGraph(
  stages: ProcessStageView[],
  stats: ProcessDefinitionStats | null,
  selectedId: string | null,
): FlowGraph {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  const lanes = lanesIn(sorted);
  const laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  const columns = columnsByDagre(sorted);

  // Stagger stages that share a lane and a column.
  const occupied = new Map<string, number>();
  const nodes: FlowNode[] = sorted.map((stage, index) => {
    const lane = laneFor(stage.owner_role);
    const li = laneIndex.get(lane.key) ?? 0;
    const col = columns.get(stage.id) ?? index;
    const slotKey = `${li}:${col}`;
    const slot = occupied.get(slotKey) ?? 0;
    occupied.set(slotKey, slot + 1);
    const x = LANE_LABEL_W + col * (NODE_W + COL_GAP) + slot * 24;
    const y =
      li * (LANE_H + LANE_GAP) + (LANE_H - NODE_H) / 2 + slot * (NODE_H / 2);
    return {
      id: stage.id,
      type: "stage",
      position: { x, y },
      width: NODE_W,
      height: NODE_H,
      data: {
        stage,
        index,
        lane,
        stats: stats?.stages[stage.stage_key] ?? null,
        selected: stage.id === selectedId,
      },
    };
  });

  const edges: FlowEdge[] = [];
  for (const s of sorted)
    for (const t of s.transitions) {
      if (!sorted.some((x) => x.id === t.to_stage_id)) continue;
      edges.push({
        id: t.id,
        source: s.id,
        target: t.to_stage_id,
        type: "flow",
        data: {
          label: t.label ?? null,
          exception: t.is_exception,
          outcome: t.condition?.outcome ?? null,
        },
      });
    }

  const maxCol = Math.max(0, ...[...columns.values()]);
  const width = LANE_LABEL_W + (maxCol + 1) * (NODE_W + COL_GAP);
  const bands: LaneBand[] = lanes.map((lane, i) => ({
    lane,
    y: i * (LANE_H + LANE_GAP),
    height: LANE_H,
    stageCount: sorted.filter((s) => s.owner_role === lane.key).length,
  }));
  return {
    nodes,
    edges,
    lanes: bands,
    width,
    height: lanes.length * (LANE_H + LANE_GAP),
  };
}

/** "3 open · 1 overdue" style summary for a node badge. */
export function describeLoad(stats: ProcessStageLiveStats | null): string {
  if (!stats || stats.open === 0) return "No live cases";
  const parts = [`${stats.open} live`];
  if (stats.overdue) parts.push(`${stats.overdue} overdue`);
  if (stats.blocked) parts.push(`${stats.blocked} blocked`);
  return parts.join(" · ");
}
