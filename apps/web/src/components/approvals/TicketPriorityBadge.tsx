"use client";

import type { TicketPriority } from "@maiyuri/shared";

interface TicketPriorityBadgeProps {
  priority: TicketPriority;
  size?: "sm" | "md" | "lg";
}

const priorityConfig: Record<
  TicketPriority,
  { label: string; className: string; icon: string }
> = {
  low: {
    label: "Low",
    className:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: "↓",
  },
  medium: {
    label: "Medium",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "→",
  },
  high: {
    label: "High",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: "↑",
  },
  urgent: {
    label: "Urgent",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: "!!",
  },
};

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-sm px-2 py-0.5",
  lg: "text-base px-2.5 py-1",
};

export function TicketPriorityBadge({
  priority,
  size = "md",
}: TicketPriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium ${config.className} ${sizeClasses[size]}`}
    >
      <span className="font-bold">{config.icon}</span>
      {config.label}
    </span>
  );
}
