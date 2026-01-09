'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import Link from 'next/link';

interface LocationData {
  area: string;
  label: string;
  count: number;
  converted: number;
  conversionRate: number;
  revenue?: number;
}

interface GeographicHeatMapProps {
  locations: LocationData[];
  title?: string;
  loading?: boolean;
  maxItems?: number;
}

export function GeographicHeatMap({
  locations,
  title = 'Leads by Area',
  loading = false,
  maxItems = 8,
}: GeographicHeatMapProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  const sortedLocations = [...locations]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxItems);

  const maxCount = Math.max(...sortedLocations.map(l => l.count), 1);
  const totalLeads = locations.reduce((sum, l) => sum + l.count, 0);

  const getHeatColor = (count: number): string => {
    const intensity = count / maxCount;
    if (intensity >= 0.8) return 'bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800';
    if (intensity >= 0.6) return 'bg-orange-100 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800';
    if (intensity >= 0.4) return 'bg-yellow-100 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-800';
    if (intensity >= 0.2) return 'bg-green-100 dark:bg-green-950/40 border-green-300 dark:border-green-800';
    return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800';
  };

  const getTextColor = (count: number): string => {
    const intensity = count / maxCount;
    if (intensity >= 0.6) return 'text-red-700 dark:text-red-400';
    if (intensity >= 0.3) return 'text-orange-700 dark:text-orange-400';
    return 'text-slate-700 dark:text-slate-300';
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {locations.length} areas
        </span>
      </div>

      {/* Heat map grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sortedLocations.map((location) => (
          <Link
            key={location.area}
            href={`/leads?area=${encodeURIComponent(location.area)}`}
            className={cn(
              'relative p-4 rounded-lg border transition-all hover:scale-105 hover:shadow-md',
              getHeatColor(location.count)
            )}
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate mb-1">
                {location.label}
              </span>
              <span className={cn('text-2xl font-bold', getTextColor(location.count))}>
                {location.count}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500">
                  {Math.round((location.count / totalLeads) * 100)}% of total
                </span>
              </div>
              {location.conversionRate > 0 && (
                <span className={cn(
                  'text-[10px] mt-1',
                  location.conversionRate >= 30 ? 'text-green-600' : 'text-slate-500'
                )}>
                  {location.conversionRate}% conv.
                </span>
              )}
            </div>

            {/* Heat indicator dot */}
            <div
              className={cn(
                'absolute top-2 right-2 w-2 h-2 rounded-full',
                location.count === maxCount && 'bg-red-500 animate-pulse',
                location.count > maxCount * 0.5 && location.count < maxCount && 'bg-orange-500',
                location.count <= maxCount * 0.5 && 'bg-slate-300 dark:bg-slate-600'
              )}
            />
          </Link>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Lead density:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-950/20 border border-blue-200" />
            <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-950/40 border border-green-300" />
            <div className="w-4 h-4 rounded bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-300" />
            <div className="w-4 h-4 rounded bg-orange-100 dark:bg-orange-950/40 border border-orange-300" />
            <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-950/40 border border-red-300" />
            <span className="text-xs text-slate-500 ml-1">High</span>
          </div>
        </div>
      </div>

      {/* Top performing area highlight */}
      {sortedLocations.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
          <div className="flex items-center gap-2">
            <MapPinIcon className="h-4 w-4 text-blue-600" />
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Top area: <strong className="text-slate-900 dark:text-white">{sortedLocations[0]?.label}</strong> with {sortedLocations[0]?.count} leads
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

export function getDefaultLocations(): LocationData[] {
  return [];
}

// Icons
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

export default GeographicHeatMap;
