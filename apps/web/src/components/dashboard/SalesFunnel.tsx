'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface FunnelStage {
  name: string;
  value: number;
  count: number;
  color: string;
}

interface SalesFunnelProps {
  stages: FunnelStage[];
  title?: string;
  loading?: boolean;
}

export function SalesFunnel({
  stages,
  title = 'Sales Funnel',
  loading = false,
}: SalesFunnelProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"
              style={{ width: `${100 - i * 15}%` }}
            />
          ))}
        </div>
      </Card>
    );
  }

  const maxValue = Math.max(...stages.map(s => s.value));

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        {title}
      </h3>

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const widthPercent = (stage.value / maxValue) * 100;

          return (
            <div key={stage.name} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {stage.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {stage.count}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({stage.value}%)
                  </span>
                </div>
              </div>
              <div className="relative h-10 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ease-out',
                    'group-hover:opacity-80'
                  )}
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: stage.color,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn(
                    'text-xs font-semibold',
                    widthPercent > 50 ? 'text-white' : 'text-slate-700 dark:text-slate-300'
                  )}>
                    {stage.value}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion arrows */}
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Total pipeline</span>
          <span className="font-medium text-slate-900 dark:text-white">
            {stages.reduce((sum, s) => sum + s.count, 0)} leads
          </span>
        </div>
        {stages.length >= 2 && (
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Overall conversion</span>
            <span className="font-medium text-green-600">
              {stages[stages.length - 1].value}%
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

// Default funnel data generator helper
export function getDefaultFunnelStages(data: {
  total: number;
  qualified: number;
  proposal: number;
  closed: number;
}): FunnelStage[] {
  const total = data.total || 1;
  return [
    {
      name: 'Lead',
      value: 100,
      count: data.total,
      color: '#3b82f6', // blue-500
    },
    {
      name: 'Qualified',
      value: Math.round((data.qualified / total) * 100),
      count: data.qualified,
      color: '#8b5cf6', // violet-500
    },
    {
      name: 'Proposal',
      value: Math.round((data.proposal / total) * 100),
      count: data.proposal,
      color: '#f59e0b', // amber-500
    },
    {
      name: 'Closed',
      value: Math.round((data.closed / total) * 100),
      count: data.closed,
      color: '#22c55e', // green-500
    },
  ];
}

export default SalesFunnel;
