"use client";

import Link from "next/link";
import { useApprovalQueue } from "@/hooks/useTickets";

interface ApprovalQueueWidgetProps {
  className?: string;
}

export function ApprovalQueueWidget({
  className = "",
}: ApprovalQueueWidgetProps) {
  const { data, isLoading, error } = useApprovalQueue();

  if (isLoading) {
    return (
      <div
        className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 ${className}`}
      >
        <div className="animate-pulse">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return null;
  }

  const stats = data.data;

  return (
    <Link
      href="/approvals"
      className={`block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-primary dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Pending Approvals
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.pending}
            </span>
            {stats.urgent > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {stats.urgent} urgent
              </span>
            )}
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-5 w-5 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            In Review
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {stats.in_review}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Approved
          </div>
          <div className="mt-0.5 text-sm font-semibold text-green-600 dark:text-green-400">
            {stats.approved_today}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
          <div className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {stats.total}
          </div>
        </div>
      </div>
    </Link>
  );
}
