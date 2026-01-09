'use client';

import { Card, Badge, Button } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import Link from 'next/link';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'review' | 'done';
  leadId?: string;
  leadName?: string;
  assignedTo?: string;
}

interface UpcomingTasksProps {
  tasks: Task[];
  title?: string;
  loading?: boolean;
  onComplete?: (taskId: string) => void;
  maxItems?: number;
}

export function UpcomingTasks({
  tasks,
  title = 'Upcoming Tasks',
  loading = false,
  onComplete,
  maxItems = 5,
}: UpcomingTasksProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 animate-pulse">
              <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-24 bg-slate-100 dark:bg-slate-700 rounded mt-2" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const sortedTasks = [...tasks]
    .filter(t => t.status !== 'done')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, maxItems);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <Link
          href="/tasks"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          View all
        </Link>
      </div>

      {sortedTasks.length === 0 ? (
        <div className="text-center py-8">
          <ChecklistIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No upcoming tasks. You&apos;re all caught up!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function TaskItem({
  task,
  onComplete,
}: {
  task: Task;
  onComplete?: (taskId: string) => void;
}) {
  const dueDate = new Date(task.dueDate);
  const isOverdue = isPast(dueDate) && !isToday(dueDate);

  const priorityColors = {
    low: 'border-l-slate-300',
    medium: 'border-l-blue-400',
    high: 'border-l-orange-400',
    urgent: 'border-l-red-500',
  };

  const priorityBadgeVariant = {
    low: 'default' as const,
    medium: 'default' as const,
    high: 'warning' as const,
    urgent: 'danger' as const,
  };

  const formatDueDate = () => {
    if (isToday(dueDate)) return 'Today';
    if (isTomorrow(dueDate)) return 'Tomorrow';
    return format(dueDate, 'MMM d');
  };

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-3 rounded-lg border-l-4 transition-colors',
        'bg-slate-50 dark:bg-slate-800/50',
        'hover:bg-slate-100 dark:hover:bg-slate-800',
        priorityColors[task.priority],
        isOverdue && 'bg-red-50 dark:bg-red-950/20'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onComplete?.(task.id)}
        className={cn(
          'flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 transition-colors',
          'border-slate-300 dark:border-slate-600',
          'hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20'
        )}
      >
        <span className="sr-only">Complete task</span>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
            {task.title}
          </span>
          <Badge variant={priorityBadgeVariant[task.priority]} className="text-[10px] px-1.5 py-0">
            {task.priority}
          </Badge>
        </div>

        {task.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-1">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs">
          <span className={cn(
            'flex items-center gap-1',
            isOverdue ? 'text-red-600 font-medium' : 'text-slate-500 dark:text-slate-400'
          )}>
            <CalendarIcon className="h-3 w-3" />
            {formatDueDate()}
            {isOverdue && ' (overdue)'}
          </span>

          {task.leadName && (
            <>
              <span className="text-slate-300">•</span>
              <Link
                href={`/leads/${task.leadId}`}
                className="text-blue-600 hover:text-blue-500 truncate"
              >
                {task.leadName}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Status indicator */}
      {task.status === 'in_progress' && (
        <div className="flex-shrink-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </span>
        </div>
      )}
    </div>
  );
}

// Icons
function ChecklistIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

export default UpcomingTasks;
