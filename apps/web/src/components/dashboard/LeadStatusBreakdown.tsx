'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import Link from 'next/link';

interface StatusCount {
  status: string;
  label: string;
  count: number;
  color: string;
  bgColor: string;
}

interface LeadStatusBreakdownProps {
  statusCounts: StatusCount[];
  totalLeads: number;
  loading?: boolean;
  title?: string;
}

export function LeadStatusBreakdown({
  statusCounts,
  totalLeads,
  loading = false,
  title = 'Leads by Status',
}: LeadStatusBreakdownProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Total: <span className="font-semibold text-slate-900 dark:text-white">{totalLeads}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statusCounts.map((item) => (
          <Link
            key={item.status}
            href={`/leads?status=${item.status}`}
            className={cn(
              'relative p-4 rounded-lg transition-all hover:scale-105 hover:shadow-md',
              item.bgColor
            )}
          >
            <div className="flex flex-col">
              <span className={cn('text-2xl font-bold', item.color)}>
                {item.count}
              </span>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1">
                {item.label}
              </span>
              {totalLeads > 0 && (
                <span className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
                  {Math.round((item.count / totalLeads) * 100)}%
                </span>
              )}
            </div>
            {/* Status indicator dot */}
            <div
              className={cn(
                'absolute top-2 right-2 w-2 h-2 rounded-full',
                item.status === 'hot' && 'bg-red-500 animate-pulse',
                item.status === 'new' && 'bg-green-500',
                item.status === 'follow_up' && 'bg-yellow-500',
                item.status === 'cold' && 'bg-blue-500',
                item.status === 'converted' && 'bg-emerald-500',
                item.status === 'lost' && 'bg-slate-400'
              )}
            />
          </Link>
        ))}
      </div>

      {/* Progress bar showing distribution */}
      <div className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
        {statusCounts.map((item) => {
          const width = totalLeads > 0 ? (item.count / totalLeads) * 100 : 0;
          if (width === 0) return null;
          return (
            <div
              key={item.status}
              className={cn('h-full transition-all', getBarColor(item.status))}
              style={{ width: `${width}%` }}
              title={`${item.label}: ${item.count} (${Math.round(width)}%)`}
            />
          );
        })}
      </div>
    </Card>
  );
}

function getBarColor(status: string): string {
  const colors: Record<string, string> = {
    new: 'bg-green-500',
    follow_up: 'bg-yellow-500',
    hot: 'bg-red-500',
    cold: 'bg-blue-400',
    converted: 'bg-emerald-600',
    lost: 'bg-slate-400',
  };
  return colors[status] || 'bg-slate-300';
}

// Helper to generate status counts from API data
export function getDefaultStatusCounts(data: {
  new: number;
  follow_up: number;
  hot: number;
  cold: number;
  converted: number;
  lost: number;
}): StatusCount[] {
  return [
    {
      status: 'new',
      label: 'New',
      count: data.new,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      status: 'follow_up',
      label: 'Follow Up',
      count: data.follow_up,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    },
    {
      status: 'hot',
      label: 'Hot',
      count: data.hot,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
    },
    {
      status: 'cold',
      label: 'Cold',
      count: data.cold,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      status: 'converted',
      label: 'Converted',
      count: data.converted,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      status: 'lost',
      label: 'Lost',
      count: data.lost,
      color: 'text-slate-600',
      bgColor: 'bg-slate-100 dark:bg-slate-800/50',
    },
  ];
}

export default LeadStatusBreakdown;
