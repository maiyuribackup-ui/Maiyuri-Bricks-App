"use client";

import { useState } from "react";
import { Spinner } from "@maiyuri/ui";
import { useTickets, useApprovalQueue } from "@/hooks/useTickets";
import {
  TicketTable,
  TicketDetailPanel,
  TicketStatusBadge,
} from "@/components/approvals";
import { Toaster, toast } from "sonner";
import type { Ticket, TicketFilters, TicketStatus } from "@maiyuri/shared";

const statusTabs: { value: TicketStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "changes_requested", label: "Changes Requested" },
];

export default function ApprovalsPage() {
  const [filters, setFilters] = useState<TicketFilters>({});
  const [activeTab, setActiveTab] = useState<TicketStatus | "all">("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const effectiveFilters: TicketFilters = {
    ...filters,
    status: activeTab === "all" ? undefined : activeTab,
  };

  const {
    data: ticketsData,
    isLoading,
    error,
    refetch,
  } = useTickets(effectiveFilters);
  const { data: queueData } = useApprovalQueue();

  const tickets = ticketsData?.data ?? [];
  const stats = queueData?.data;

  const handleTabChange = (tab: TicketStatus | "all") => {
    setActiveTab(tab);
    setFilters((prev) => ({ ...prev, status: undefined }));
  };

  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
  };

  const handlePanelClose = () => {
    setSelectedTicket(null);
  };

  const handleActionComplete = () => {
    refetch();
    toast.success("Ticket updated successfully");
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Approvals
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Review and manage approval requests
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Quick Stats */}
          {stats && (
            <div className="flex gap-4 text-sm">
              <div className="rounded-lg bg-yellow-50 px-3 py-2 dark:bg-yellow-900/20">
                <span className="font-semibold text-yellow-700 dark:text-yellow-400">
                  {stats.pending}
                </span>
                <span className="ml-1 text-yellow-600 dark:text-yellow-500">
                  Pending
                </span>
              </div>
              {stats.urgent > 0 && (
                <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                  <span className="font-semibold text-red-700 dark:text-red-400">
                    {stats.urgent}
                  </span>
                  <span className="ml-1 text-red-600 dark:text-red-500">
                    Urgent
                  </span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => refetch()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4">
          {statusTabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const count =
              tab.value === "all"
                ? (stats?.total ?? 0)
                : tab.value === "pending"
                  ? (stats?.pending ?? 0)
                  : tab.value === "in_review"
                    ? (stats?.in_review ?? 0)
                    : undefined;

            return (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-4 text-center text-red-600 dark:bg-red-900/20 dark:text-red-400">
          Failed to load tickets. Please try again.
        </div>
      ) : (
        <TicketTable
          tickets={tickets}
          onTicketClick={handleTicketClick}
          filters={filters}
          onFiltersChange={setFilters}
        />
      )}

      {/* Detail Panel */}
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          isOpen={!!selectedTicket}
          onClose={handlePanelClose}
          onActionComplete={handleActionComplete}
        />
      )}
    </div>
  );
}
