"use client";

import type { TicketStatus } from "@maiyuri/shared";

interface TicketStatusBadgeProps {
  status: TicketStatus;
  size?: "sm" | "md" | "lg";
}

const statusConfig: Record<TicketStatus, { label: string; className: string }> =
  {
    pending: {
      label: "Pending",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    in_review: {
      label: "In Review",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    },
    approved: {
      label: "Approved",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    rejected: {
      label: "Rejected",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    },
    changes_requested: {
      label: "Changes Requested",
      className:
        "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    },
  };

const sizeClasses = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-0.5",
  lg: "text-base px-3 py-1",
};

export function TicketStatusBadge({
  status,
  size = "md",
}: TicketStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.className} ${sizeClasses[size]}`}
    >
      {config.label}
    </span>
  );
}
