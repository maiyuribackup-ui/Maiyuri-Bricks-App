"use client";

import type { TicketHistoryEntry } from "@maiyuri/shared";
import { formatDistanceToNow } from "date-fns";

interface TicketTimelineProps {
  history: TicketHistoryEntry[];
  isLoading?: boolean;
}

const actionConfig: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  created: {
    label: "Ticket Created",
    icon: "🎫",
    color: "bg-blue-500",
  },
  status_changed: {
    label: "Status Changed",
    icon: "🔄",
    color: "bg-purple-500",
  },
  assigned: {
    label: "Assigned",
    icon: "👤",
    color: "bg-indigo-500",
  },
  commented: {
    label: "Comment Added",
    icon: "💬",
    color: "bg-gray-500",
  },
  approved: {
    label: "Approved",
    icon: "✅",
    color: "bg-green-500",
  },
  rejected: {
    label: "Rejected",
    icon: "❌",
    color: "bg-red-500",
  },
  changes_requested: {
    label: "Changes Requested",
    icon: "📝",
    color: "bg-orange-500",
  },
};

export function TicketTimeline({
  history,
  isLoading = false,
}: TicketTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No history available
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {history.map((entry, index) => {
          const config = actionConfig[entry.action] ?? {
            label: entry.action,
            icon: "📋",
            color: "bg-gray-500",
          };
          const isLast = index === history.length - 1;

          return (
            <li key={entry.id}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex space-x-3">
                  <div>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${config.color}`}
                    >
                      {config.icon}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {config.label}
                        {entry.performed_by_user?.full_name && (
                          <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">
                            by {entry.performed_by_user.full_name}
                          </span>
                        )}
                      </p>
                      {entry.field_changed && (
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {entry.field_changed}:{" "}
                          <span className="line-through">
                            {entry.old_value}
                          </span>{" "}
                          →{" "}
                          <span className="font-medium">{entry.new_value}</span>
                        </p>
                      )}
                      {entry.comment && (
                        <p className="mt-1 rounded-md bg-gray-100 p-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {entry.comment}
                        </p>
                      )}
                    </div>
                    <div className="whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(entry.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
