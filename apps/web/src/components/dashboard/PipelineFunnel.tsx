"use client";

import { Card } from "@maiyuri/ui";
import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface FunnelStage {
  name: string;
  value: number; // percentage of the top of funnel
  count: number;
  color: string;
}

interface PipelineFunnelProps {
  stages: FunnelStage[];
  title?: string;
  loading?: boolean;
}

interface TooltipPayloadItem {
  payload: FunnelStage;
}

function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-xl dark:bg-slate-700">
      <div className="font-semibold">{d.name}</div>
      <div className="text-slate-300">
        {d.count} lead{d.count === 1 ? "" : "s"} · {d.value}% of pipeline
      </div>
    </div>
  );
}

export function PipelineFunnel({
  stages,
  title = "Sales Funnel",
  loading = false,
}: PipelineFunnelProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="mb-4 h-6 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="flex flex-col items-center gap-2">
          {[100, 78, 56, 38, 22].map((w, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </Card>
    );
  }

  const hasData = stages.some((s) => s.count > 0);

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <span className="text-xs text-slate-400">cumulative · active leads</span>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        How many active leads have reached each step of the journey.
      </p>

      {!hasData ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
          No active leads in the pipeline yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <FunnelChart>
            <Tooltip content={<FunnelTooltip />} />
            <Funnel dataKey="count" data={stages} isAnimationActive lastShapeType="rectangle">
              {stages.map((s, i) => (
                <Cell key={i} fill={s.color} />
              ))}
              <LabelList
                position="right"
                dataKey="name"
                stroke="none"
                className="fill-slate-700 dark:fill-slate-200"
                fontSize={12}
              />
              <LabelList
                position="left"
                dataKey="count"
                stroke="none"
                className="fill-slate-900 dark:fill-white"
                fontSize={13}
                fontWeight={700}
              />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function getDefaultFunnelStages(): FunnelStage[] {
  return [];
}
