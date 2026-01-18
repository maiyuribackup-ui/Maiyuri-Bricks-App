"use client";

import { useState } from "react";
import type {
  Ticket,
  TicketFilters,
  TicketStatus,
  TicketPriority,
} from "@maiyuri/shared";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { formatDistanceToNow } from "date-fns";

interface TicketTableProps {
  tickets: Ticket[];
  isLoading?: boolean;
  onTicketClick?: (ticket: Ticket) => void;
  filters?: TicketFilters;
  onFiltersChange?: (filters: TicketFilters) => void;
}

const statusOptions: { value: TicketStatus | ""; label: string }[] = [
  { value: "", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "changes_requested", label: "Changes Requested" },
];

const priorityOptions: { value: TicketPriority | ""; label: string }[] = [
  { value: "", label: "All Priority" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function TicketTable({
  tickets,
  isLoading = false,
  onTicketClick,
  filters = {},
  onFiltersChange,
}: TicketTableProps) {
  const [searchQuery, setSearchQuery] = useState(filters.search ?? "");

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onFiltersChange?.({ ...filters, search: value || undefined });
  };

  const handleStatusChange = (value: string) => {
    onFiltersChange?.({
      ...filters,
      status: value ? (value as TicketStatus) : undefined,
    });
  };

  const handlePriorityChange = (value: string) => {
    onFiltersChange?.({
      ...filters,
      priority: value ? (value as TicketPriority) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search tickets..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800"
        />
        <select
          value={filters.status ?? ""}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filters.priority ?? ""}
          onChange={(e) => handlePriorityChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800"
        >
          {priorityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Ticket
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Due Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {tickets.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No tickets found
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  onClick={() => onTicketClick?.(ticket)}
                  className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {ticket.ticket_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    <div className="max-w-xs truncate">{ticket.title}</div>
                    {ticket.description && (
                      <div className="mt-1 max-w-xs truncate text-xs text-gray-500 dark:text-gray-400">
                        {ticket.description}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <TicketStatusBadge status={ticket.status} size="sm" />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <TicketPriorityBadge priority={ticket.priority} size="sm" />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(new Date(ticket.created_at), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {ticket.due_date
                      ? formatDistanceToNow(new Date(ticket.due_date), {
                          addSuffix: true,
                        })
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
