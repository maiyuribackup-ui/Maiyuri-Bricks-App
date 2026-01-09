'use client';

import { Card, Badge } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import Link from 'next/link';

interface AgingBucket {
  range: string;
  label: string;
  count: number;
  leads: Array<{
    id: string;
    name: string;
    status: string;
    daysInStatus: number;
  }>;
  color: string;
  urgency: 'normal' | 'warning' | 'critical';
}

interface LeadAgingReportProps {
  buckets: AgingBucket[];
  title?: string;
  loading?: boolean;
  showDetails?: boolean;
}

export function LeadAgingReport({
  buckets,
  title = 'Lead Aging',
  loading = false,
  showDetails = true,
}: LeadAgingReportProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  const totalStale = buckets
    .filter(b => b.urgency !== 'normal')
    .reduce((sum, b) => sum + b.count, 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        {totalStale > 0 && (
          <Badge variant="warning">
            {totalStale} stale {totalStale === 1 ? 'lead' : 'leads'}
          </Badge>
        )}
      </div>

      {/* Aging Buckets */}
      <div className="space-y-3">
        {buckets.map((bucket) => (
          <div
            key={bucket.range}
            className={cn(
              'p-4 rounded-lg border-l-4 transition-colors',
              bucket.urgency === 'critical' && 'bg-red-50 dark:bg-red-950/20 border-l-red-500',
              bucket.urgency === 'warning' && 'bg-yellow-50 dark:bg-yellow-950/20 border-l-yellow-500',
              bucket.urgency === 'normal' && 'bg-slate-50 dark:bg-slate-800/50 border-l-slate-300'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {bucket.label}
                </span>
                {bucket.urgency === 'critical' && (
                  <AlertIcon className="h-4 w-4 text-red-500" />
                )}
                {bucket.urgency === 'warning' && (
                  <ClockIcon className="h-4 w-4 text-yellow-500" />
                )}
              </div>
              <span className={cn(
                'text-xl font-bold',
                bucket.urgency === 'critical' && 'text-red-600',
                bucket.urgency === 'warning' && 'text-yellow-600',
                bucket.urgency === 'normal' && 'text-slate-700 dark:text-slate-300'
              )}>
                {bucket.count}
              </span>
            </div>

            {/* Progress bar showing percentage of total */}
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
              <div
                className={cn(
                  'h-full rounded-full',
                  bucket.urgency === 'critical' && 'bg-red-500',
                  bucket.urgency === 'warning' && 'bg-yellow-500',
                  bucket.urgency === 'normal' && 'bg-slate-400'
                )}
                style={{
                  width: `${Math.min(100, bucket.count * 10)}%`,
                }}
              />
            </div>

            {/* Show individual leads if details enabled */}
            {showDetails && bucket.leads.length > 0 && bucket.urgency !== 'normal' && (
              <div className="mt-3 space-y-1">
                {bucket.leads.slice(0, 3).map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between p-2 rounded bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {lead.name}
                    </span>
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded',
                      lead.daysInStatus > 14 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    )}>
                      {lead.daysInStatus}d
                    </span>
                  </Link>
                ))}
                {bucket.leads.length > 3 && (
                  <Link
                    href={`/leads?aging=${bucket.range}`}
                    className="text-xs text-blue-600 hover:text-blue-500 pl-2"
                  >
                    +{bucket.leads.length - 3} more
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            Average days in pipeline
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {calculateAvgDays(buckets)} days
          </span>
        </div>
      </div>
    </Card>
  );
}

function calculateAvgDays(buckets: AgingBucket[]): number {
  const totalLeads = buckets.reduce((sum, b) => sum + b.count, 0);
  if (totalLeads === 0) return 0;

  const weightedSum = buckets.reduce((sum, b) => {
    const avgDaysInBucket = b.range === '0-3' ? 1.5 :
                           b.range === '4-7' ? 5.5 :
                           b.range === '8-14' ? 11 :
                           b.range === '15-30' ? 22 : 45;
    return sum + (b.count * avgDaysInBucket);
  }, 0);

  return Math.round(weightedSum / totalLeads);
}

export function getDefaultAgingBuckets(): AgingBucket[] {
  return [
    { range: '0-3', label: '0-3 days (Fresh)', count: 0, leads: [], color: '#22c55e', urgency: 'normal' },
    { range: '4-7', label: '4-7 days', count: 0, leads: [], color: '#3b82f6', urgency: 'normal' },
    { range: '8-14', label: '8-14 days (Getting Stale)', count: 0, leads: [], color: '#f59e0b', urgency: 'warning' },
    { range: '15-30', label: '15-30 days (Stale)', count: 0, leads: [], color: '#ef4444', urgency: 'warning' },
    { range: '30+', label: '30+ days (Critical)', count: 0, leads: [], color: '#dc2626', urgency: 'critical' },
  ];
}

// Icons
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default LeadAgingReport;
