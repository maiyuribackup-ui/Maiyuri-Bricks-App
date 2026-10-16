"use client";

/**
 * Interactive swimlane Process Map on React Flow. One lane per owning role,
 * colour per lane, stage-type accents, dashed exception returns, and live
 * case counts on every stage so the map doubles as a control board.
 */
import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Flag,
  GitBranch,
  Hourglass,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type {
  ProcessDefinitionStats,
  ProcessStageType,
  ProcessStageView,
} from "@maiyuri/shared";
import {
  LANE_H,
  LANE_LABEL_W,
  NODE_H,
  NODE_W,
  STAGE_TYPE_STYLE,
  buildFlowGraph,
  type FlowEdgeData,
  type FlowNodeData,
} from "@/lib/process/map-layout";
import { formatSla } from "./ProcessStageCard";

const TYPE_ICON: Record<ProcessStageType, LucideIcon> = {
  ACTION: CheckCircle2,
  DECISION: GitBranch,
  HANDOVER: ArrowLeftRight,
  WAIT: Hourglass,
  AUTOMATION: Sparkles,
  END: Flag,
};

// ---------------------------------------------------------------- node ----

function StageNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { stage, index, lane, stats, selected } = data;
  const type = STAGE_TYPE_STYLE[stage.stage_type];
  const Icon = TYPE_ICON[stage.stage_type];
  const sla = formatSla(stage.sla_minutes);
  const live = stats?.open ?? 0;
  const overdue = stats?.overdue ?? 0;
  const blocked = stats?.blocked ?? 0;
  const isEnd = stage.stage_type === "END";
  const isDecision = stage.stage_type === "DECISION";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${index + 1}. ${stage.name}, ${lane.label}${live ? `, ${live} live case${live === 1 ? "" : "s"}` : ""}`}
      style={{
        width: NODE_W,
        height: NODE_H,
        borderColor: selected ? lane.hue : "rgb(226 232 240)",
        boxShadow: selected
          ? `0 0 0 3px ${lane.wash}, 0 10px 24px -12px ${lane.hue}66`
          : "0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 20px -14px rgba(15, 23, 42, 0.25)",
        borderRadius: isEnd ? 999 : isDecision ? 18 : 14,
        borderStyle: stage.stage_type === "WAIT" ? "dashed" : "solid",
      }}
      className="group relative flex cursor-pointer select-none flex-col justify-between border-2 bg-white px-3.5 py-2.5 text-left outline-none transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />

      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[13px] font-bold tabular-nums"
          style={{ background: lane.wash, color: lane.deep }}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-tight text-slate-900">
            {stage.name}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{ background: type.wash, color: type.hue }}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {type.label}
            </span>
            {sla && (
              <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-slate-500">
                <Clock className="h-3 w-3" aria-hidden="true" /> {sla}
              </span>
            )}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-500">
          {stage.gates.length > 0
            ? `${stage.gates.length} gate${stage.gates.length === 1 ? "" : "s"}`
            : "no gate"}
        </span>
        {live > 0 ? (
          <span className="flex items-center gap-1">
            {blocked > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {blocked}
              </span>
            )}
            {overdue > 0 && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700">
                {overdue} late
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 font-bold tabular-nums text-white"
              style={{ background: lane.hue }}
            >
              {live}
            </span>
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- edge ----

function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const d = (data ?? {}) as FlowEdgeData;
  const backwards = targetX < sourceX;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
    offset: backwards ? 36 : 20,
  });
  const colour = d.exception ? "#e11d48" : "#94a3b8";
  const text = d.label ?? (d.outcome ? d.outcome.toLowerCase() : null);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={d.exception ? "url(#arrow-exception)" : "url(#arrow-flow)"}
        style={{
          stroke: colour,
          strokeWidth: d.exception ? 1.5 : 2,
          strokeDasharray: d.exception ? "6 5" : undefined,
          opacity: d.exception ? 0.9 : 1,
        }}
      />
      {text && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: d.exception ? "#fecdd3" : "#e2e8f0",
              color: d.exception ? "#be123c" : "#475569",
            }}
            className="nodrag nopan pointer-events-none absolute rounded-full border bg-white/95 px-2 py-0.5 text-[10.5px] font-semibold shadow-sm"
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { stage: StageNode };
const EDGE_TYPES = { flow: FlowEdgeComponent };

// ---------------------------------------------------------------- lanes ----

function LaneBackdrop({
  lanes,
  width,
}: {
  lanes: ReturnType<typeof buildFlowGraph>["lanes"];
  width: number;
}) {
  // ViewportPortal puts the bands in flow coordinates, so they pan and zoom
  // with the nodes instead of sitting still behind them.
  return (
    <ViewportPortal>
      {lanes.map((band) => (
        <div
          key={band.lane.key}
          className="pointer-events-none absolute flex overflow-hidden rounded-2xl"
          style={{
            left: 0,
            top: band.y,
            height: band.height,
            width: Math.max(width, 640),
            background: band.lane.wash,
          }}
        >
          <div
            className="flex h-full flex-col justify-center gap-0.5 pl-4"
            style={{ width: LANE_LABEL_W }}
          >
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-bold"
              style={{ color: band.lane.deep }}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: band.lane.hue }}
              />
              {band.lane.label}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {band.stageCount} stage{band.stageCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ))}
    </ViewportPortal>
  );
}

// ---------------------------------------------------------------- map ----

export interface ProcessFlowMapProps {
  stages: ProcessStageView[];
  stats: ProcessDefinitionStats | null;
  selectedId: string | null;
  onSelect: (stage: ProcessStageView | null) => void;
  className?: string;
}

function ProcessFlowMapInner({
  stages,
  stats,
  selectedId,
  onSelect,
  className = "",
}: ProcessFlowMapProps) {
  const graph = useMemo(
    () => buildFlowGraph(stages, stats, selectedId),
    [stages, stats, selectedId],
  );
  const { fitView } = useReactFlow();

  // Refit only when the set of stages changes, not on every selection.
  const stageCount = stages.length;
  useEffect(() => {
    const t = window.setTimeout(
      () => fitView({ padding: 0.08, duration: 300 }),
      30,
    );
    return () => window.clearTimeout(t);
  }, [stageCount, fitView]);

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const s = stages.find((x) => x.id === node.id) ?? null;
      onSelect(s && s.id === selectedId ? null : s);
    },
    [stages, selectedId, onSelect],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-slate-200 bg-white ${className}`}
      style={{ height: Math.max(360, graph.height + 120) }}
      data-testid="process-flow-map"
    >
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <marker
            id="arrow-flow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker
            id="arrow-exception"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e11d48" />
          </marker>
        </defs>
      </svg>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.35}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <LaneBackdrop lanes={graph.lanes} width={graph.width} />
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color="#cbd5e1"
        />
        <Controls
          showInteractive={false}
          position="bottom-right"
          className="!rounded-xl !border !border-slate-200 !bg-white !shadow-sm [&>button]:!border-slate-100 [&>button]:!bg-white [&>button:hover]:!bg-slate-50"
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          className="!rounded-xl !border !border-slate-200 !bg-white/90"
          nodeColor={(n) => (n.data as FlowNodeData).lane?.hue ?? "#94a3b8"}
          nodeStrokeWidth={0}
          maskColor="rgba(241, 245, 249, 0.75)"
        />
      </ReactFlow>
    </div>
  );
}

export function ProcessFlowMap(props: ProcessFlowMapProps) {
  return (
    <ReactFlowProvider>
      <ProcessFlowMapInner {...props} />
    </ReactFlowProvider>
  );
}

/** Legend row shared by the map page header. */
export function ProcessMapLegend({
  lanes,
}: {
  lanes: ReturnType<typeof buildFlowGraph>["lanes"];
}) {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] font-medium text-slate-600"
      aria-label="Legend"
    >
      {lanes.map(({ lane }) => (
        <li key={lane.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: lane.hue }}
          />
          {lane.label} owns
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-0 w-5 border-t-2 border-slate-400"
        />
        Normal path
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-0 w-5 border-t-2 border-dashed border-rose-500"
        />
        Exception / return
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white"
        >
          3
        </span>
        Live cases on the stage
      </li>
    </ul>
  );
}

export const FLOW_NODE_HEIGHT = NODE_H;
export const FLOW_LANE_HEIGHT = LANE_H;
