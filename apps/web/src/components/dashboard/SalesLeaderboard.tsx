'use client';

import { Card, Avatar, Badge } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface SalesPerson {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  leadsConverted: number;
  totalLeads: number;
  revenue?: number;
  rank: number;
  change?: number; // position change from last period
}

interface SalesLeaderboardProps {
  salespeople: SalesPerson[];
  title?: string;
  loading?: boolean;
  showRevenue?: boolean;
}

export function SalesLeaderboard({
  salespeople,
  title = 'Sales Leaderboard',
  loading = false,
  showRevenue = true,
}: SalesLeaderboardProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-1" />
              </div>
              <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
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
        <TrophyIcon className="h-5 w-5 text-amber-500" />
      </div>

      {salespeople.length === 0 ? (
        <div className="text-center py-8">
          <TrophyIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No sales data available yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {salespeople.map((person, index) => (
            <LeaderboardRow
              key={person.id}
              person={person}
              isTop3={index < 3}
              showRevenue={showRevenue}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function LeaderboardRow({
  person,
  isTop3,
  showRevenue,
}: {
  person: SalesPerson;
  isTop3: boolean;
  showRevenue: boolean;
}) {
  const rankColors = {
    1: 'bg-amber-100 text-amber-700 border-amber-300',
    2: 'bg-slate-100 text-slate-600 border-slate-300',
    3: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  const conversionRate = person.totalLeads > 0
    ? Math.round((person.leadsConverted / person.totalLeads) * 100)
    : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg transition-colors',
        isTop3
          ? 'bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
      )}
    >
      {/* Rank */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border',
          person.rank <= 3
            ? rankColors[person.rank as 1 | 2 | 3]
            : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
        )}
      >
        {person.rank}
      </div>

      {/* Avatar */}
      <Avatar
        src={person.avatar}
        alt={person.name}
        fallback={person.name.charAt(0)}
        size="md"
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 dark:text-white truncate">
            {person.name}
          </span>
          {person.change !== undefined && person.change !== 0 && (
            <span className={cn(
              'text-xs font-medium',
              person.change > 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {person.change > 0 ? '↑' : '↓'}{Math.abs(person.change)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{person.leadsConverted}/{person.totalLeads} leads</span>
          <span className="text-slate-300">•</span>
          <span className={cn(
            'font-medium',
            conversionRate >= 30 ? 'text-green-600' :
            conversionRate >= 15 ? 'text-yellow-600' : 'text-slate-500'
          )}>
            {conversionRate}% rate
          </span>
        </div>
      </div>

      {/* Revenue/Score */}
      {showRevenue && person.revenue !== undefined && (
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            ₹{(person.revenue / 1000).toFixed(0)}K
          </div>
          <div className="text-xs text-slate-500">revenue</div>
        </div>
      )}
    </div>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  );
}

export default SalesLeaderboard;
