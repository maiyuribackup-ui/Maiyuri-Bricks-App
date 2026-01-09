'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  type: 'lead_created' | 'lead_converted' | 'note_added' | 'status_changed' | 'estimate_created' | 'follow_up_scheduled';
  leadId?: string;
  leadName: string;
  description: string;
  userId?: string;
  userName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface RecentActivityProps {
  activities: Activity[];
  title?: string;
  loading?: boolean;
  maxItems?: number;
}

export function RecentActivity({
  activities,
  title = 'Recent Activity',
  loading = false,
  maxItems = 8,
}: RecentActivityProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-1" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <ClockIcon className="h-5 w-5 text-slate-400" />
      </div>

      {displayActivities.length === 0 ? (
        <div className="text-center py-8">
          <ClockIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No recent activity to show.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

          <div className="space-y-4">
            {displayActivities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      )}

      {activities.length > maxItems && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Link
            href="/activity"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            View all activity →
          </Link>
        </div>
      )}
    </Card>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const iconConfig = getActivityIcon(activity.type);

  return (
    <div className="relative flex gap-3 pl-2">
      {/* Icon */}
      <div
        className={cn(
          'relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          iconConfig.bgColor
        )}
      >
        {iconConfig.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm text-slate-900 dark:text-white">
          {activity.leadId ? (
            <Link
              href={`/leads/${activity.leadId}`}
              className="font-medium hover:text-blue-600"
            >
              {activity.leadName}
            </Link>
          ) : (
            <span className="font-medium">{activity.leadName}</span>
          )}
          <span className="text-slate-600 dark:text-slate-400">
            {' '}{activity.description}
          </span>
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
          </span>
          {activity.userName && (
            <>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                by {activity.userName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function getActivityIcon(type: Activity['type']) {
  const icons = {
    lead_created: {
      icon: <UserPlusIcon className="h-4 w-4 text-green-600" />,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    lead_converted: {
      icon: <CheckCircleIcon className="h-4 w-4 text-blue-600" />,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    note_added: {
      icon: <DocumentIcon className="h-4 w-4 text-purple-600" />,
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    status_changed: {
      icon: <ArrowPathIcon className="h-4 w-4 text-amber-600" />,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
    estimate_created: {
      icon: <CalculatorIcon className="h-4 w-4 text-indigo-600" />,
      bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    },
    follow_up_scheduled: {
      icon: <CalendarIcon className="h-4 w-4 text-teal-600" />,
      bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    },
  };

  return icons[type] || icons.note_added;
}

// Icons
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
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

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ArrowPathIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

export default RecentActivity;
