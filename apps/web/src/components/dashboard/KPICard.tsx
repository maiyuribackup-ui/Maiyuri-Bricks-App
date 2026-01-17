'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  suffix?: string;
  prefix?: string;
  loading?: boolean;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

export function KPICard({
  title,
  value,
  change,
  changeLabel = 'vs last period',
  icon,
  suffix,
  prefix,
  loading = false,
  variant = 'default',
}: KPICardProps) {
  const isPositive = change !== undefined && change >= 0;
  const changeFormatted = change !== undefined
    ? `${isPositive ? '+' : ''}${change.toFixed(1)}%`
    : null;

  const variantClasses = {
    default: 'bg-white dark:bg-slate-900',
    primary: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white',
    success: 'bg-gradient-to-br from-green-500 to-green-600 text-white',
    warning: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
  };

  const textClasses = {
    default: 'text-slate-900 dark:text-white',
    primary: 'text-white',
    success: 'text-white',
    warning: 'text-white',
  };

  const subtextClasses = {
    default: 'text-slate-500 dark:text-slate-400',
    primary: 'text-blue-100',
    success: 'text-green-100',
    warning: 'text-amber-100',
  };

  return (
    <Card className={cn('p-5 relative overflow-hidden', variantClasses[variant])}>
      {/* Background decorative element */}
      {variant !== 'default' && (
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className={cn('text-sm font-medium', subtextClasses[variant])}>
            {title}
          </span>
          {icon && (
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center',
              variant === 'default'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                : 'bg-white/20 text-white'
            )}>
              {icon}
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-9 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        ) : (
          <div className={cn('text-3xl font-bold', textClasses[variant])}>
            {prefix}
            {typeof value === 'number' ? (value || 0).toLocaleString() : value}
            {suffix}
          </div>
        )}

        {changeFormatted && (
          <div className="mt-2 flex items-center gap-1">
            {isPositive ? (
              <TrendUpIcon className={cn('h-4 w-4', variant === 'default' ? 'text-green-500' : 'text-white/90')} />
            ) : (
              <TrendDownIcon className={cn('h-4 w-4', variant === 'default' ? 'text-red-500' : 'text-white/90')} />
            )}
            <span className={cn(
              'text-sm font-medium',
              variant === 'default'
                ? isPositive ? 'text-green-600' : 'text-red-600'
                : 'text-white/90'
            )}>
              {changeFormatted}
            </span>
            <span className={cn('text-xs', subtextClasses[variant])}>
              {changeLabel}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
    </svg>
  );
}

export default KPICard;
