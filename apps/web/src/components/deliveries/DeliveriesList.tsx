"use client";

import { useState, useMemo } from "react";
import { Card, Button, Spinner } from "@maiyuri/ui";
import {
  useDeliveries,
  useSyncDeliveries,
  type ClientDeliveryFilters,
} from "@/hooks/useDeliveries";
import { DeliveryCard } from "./DeliveryCard";
import type { DeliveryStatus } from "@maiyuri/shared";
import { RefreshCw, Truck, Search } from "lucide-react";

type TabType = "today" | "upcoming" | "completed" | "all";

const tabs: { id: TabType; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

export function DeliveriesList() {
  // State
  const [activeTab, setActiveTab] = useState<TabType>("today");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Build filters based on active tab
  const filters: ClientDeliveryFilters = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const baseFilters: ClientDeliveryFilters = {
      search: searchQuery || undefined,
      sortOrder: "asc",
      limit: 100,
    };

    // Apply status filter if not "all"
    if (statusFilter !== "all") {
      baseFilters.status = statusFilter as ClientDeliveryFilters["status"];
    }

    switch (activeTab) {
      case "today":
        return {
          ...baseFilters,
          dateFrom: today.toISOString(),
          dateTo: tomorrow.toISOString(),
        };
      case "upcoming":
        return {
          ...baseFilters,
          dateFrom: tomorrow.toISOString(),
        };
      case "completed":
        return {
          ...baseFilters,
          status: "delivered",
          sortOrder: "desc",
        };
      case "all":
      default:
        return baseFilters;
    }
  }, [activeTab, statusFilter, searchQuery]);

  // Data fetching
  const { data: deliveriesData, isLoading, refetch } = useDeliveries(filters);
  const syncMutation = useSyncDeliveries();

  const deliveries = deliveriesData?.data ?? [];

  // Handlers
  const handleSync = async () => {
    try {
      // Sync last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      await syncMutation.mutateAsync(thirtyDaysAgo.toISOString().split("T")[0]);
      refetch();
    } catch (error) {
      console.error("Sync failed:", error);
    }
  };

  const isSyncing = syncMutation.isPending;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Deliveries
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage and track delivery orders from Odoo
          </p>
        </div>
        <Button variant="secondary" onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync from Odoo
            </>
          )}
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          {activeTab !== "completed" && (
            <div className="w-full sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="waiting">Waiting</option>
                <option value="confirmed">Confirmed</option>
                <option value="assigned">Assigned</option>
                <option value="in_transit">In Transit</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search by reference, customer, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
      </Card>

      {/* Deliveries List */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : deliveries.length === 0 ? (
        <Card className="p-12 text-center">
          <Truck className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">
            No deliveries
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {searchQuery || statusFilter !== "all"
              ? "No deliveries match your filters"
              : activeTab === "today"
                ? "No deliveries scheduled for today"
                : activeTab === "upcoming"
                  ? "No upcoming deliveries"
                  : activeTab === "completed"
                    ? "No completed deliveries"
                    : "Sync from Odoo to see deliveries"}
          </p>
          {!searchQuery && statusFilter === "all" && activeTab === "all" && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleSync}
              disabled={isSyncing}
            >
              Sync from Odoo
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {deliveries.map((delivery) => (
            <DeliveryCard key={delivery.id} delivery={delivery} />
          ))}
        </div>
      )}

      {/* Sync status */}
      {syncMutation.isSuccess && (
        <div className="mt-4 text-center text-sm text-green-600 dark:text-green-400">
          Sync completed:{" "}
          {(syncMutation.data?.data as { synced?: number })?.synced ?? 0}{" "}
          deliveries updated
        </div>
      )}
      {syncMutation.isError && (
        <div className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
          Sync failed. Please try again.
        </div>
      )}
    </>
  );
}
