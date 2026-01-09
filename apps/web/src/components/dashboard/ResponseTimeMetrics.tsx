'use client';

import { Card, Badge } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface ResponseMetrics {
  avgFirstContactHours: number;
  avgTimeToQualify: number; // days
  avgTimeToConvert: number; // days
  leadsWaitingContact: number;
  leadsOverdue: number;
}

interface ResponseTimeMetricsProps {
  metrics: ResponseMetrics;
  title?: string;
  loading?: boolean;
}

export function ResponseTimeMetrics({
  metrics,
  title = 'Response Time',
  loading = false,
}: ResponseTimeMetricsProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  const getContactTimeStatus = (hours: number) => {
    if (hours <= 1) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' };
    if (hours <= 4) return { label: 'Good', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' };
    if (hours <= 24) return { label: 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/30' };
    return { label: 'Needs Improvement', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' };
  };

  const contactStatus = getContactTimeStatus(metrics.avgFirstContactHours);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <Badge variant={metrics.leadsOverdue > 0 ? 'danger' : 'success'}>
          {metrics.leadsOverdue > 0 ? `${metrics.leadsOverdue} overdue` : 'On track'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* First Contact Time */}
        <div className={cn('p-4 rounded-lg', contactStatus.bg)}>
          <div className="flex items-center gap-2 mb-2">
            <ClockIcon className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Avg. First Contact
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-2xl font-bold', contactStatus.color)}>
              {metrics.avgFirstContactHours < 1
                ? `${Math.round(metrics.avgFirstContactHours * 60)}m`
                : `${metrics.avgFirstContactHours.toFixed(1)}h`}
            </span>
            <span className={cn('text-xs', contactStatus.color)}>{contactStatus.label}</span>
          </div>
        </div>

        {/* Time to Qualify */}
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircleIcon className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Avg. Time to Qualify
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {metrics.avgTimeToQualify.toFixed(1)}
            </span>
            <span className="text-sm text-slate-500">days</span>
          </div>
        </div>

        {/* Time to Convert */}
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-2">
            <TrophyIcon className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Avg. Time to Convert
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {metrics.avgTimeToConvert.toFixed(1)}
            </span>
            <span className="text-sm text-slate-500">days</span>
          </div>
        </div>

        {/* Waiting Contact */}
        <div className={cn(
          'p-4 rounded-lg',
          metrics.leadsWaitingContact > 5 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-slate-50 dark:bg-slate-800/50'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <AlertIcon className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Awaiting Contact
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn(
              'text-2xl font-bold',
              metrics.leadsWaitingContact > 5 ? 'text-red-600' : 'text-slate-900 dark:text-white'
            )}>
              {metrics.leadsWaitingContact}
            </span>
            <span className="text-sm text-slate-500">leads</span>
          </div>
        </div>
      </div>

      {/* Progress indicator for response quality */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Response Quality Score</span>
          <span>{getResponseScore(metrics)}%</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              getResponseScore(metrics) >= 80 ? 'bg-green-500' :
              getResponseScore(metrics) >= 60 ? 'bg-yellow-500' : 'bg-red-500'
            )}
            style={{ width: `${getResponseScore(metrics)}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

function getResponseScore(metrics: ResponseMetrics): number {
  let score = 100;

  // Deduct for slow first contact (target: <1 hour)
  if (metrics.avgFirstContactHours > 1) score -= Math.min(30, (metrics.avgFirstContactHours - 1) * 5);

  // Deduct for overdue leads
  score -= Math.min(30, metrics.leadsOverdue * 5);

  // Deduct for leads waiting contact
  score -= Math.min(20, metrics.leadsWaitingContact * 2);

  return Math.max(0, Math.round(score));
}

export function getDefaultResponseMetrics(): ResponseMetrics {
  return {
    avgFirstContactHours: 0,
    avgTimeToQualify: 0,
    avgTimeToConvert: 0,
    leadsWaitingContact: 0,
    leadsOverdue: 0,
  };
}

// Icons
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-2.748-1.35" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export default ResponseTimeMetrics;
