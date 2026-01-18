"use client";

import { useState, useMemo } from "react";
import { Card, Button, Badge, Spinner } from "@maiyuri/ui";
import {
  useProductionOrders,
  useSyncFinishedGoods,
  useSyncEmployees,
} from "@/hooks/useProduction";
import { ProductionOrderPanel } from "./ProductionOrderPanel";
import { ProductionOrderStatusBadge } from "./ProductionOrderStatusBadge";
import type { ProductionOrderFiltersData } from "@maiyuri/shared";

interface ProductionOrdersListProps {
  initialStatus?: string;
}

export function ProductionOrdersList({
  initialStatus,
}: ProductionOrdersListProps) {
  // State
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "all");
  const [searchQuery, setSearchQuery] = useState("");

  // Build filters
  const filters: ProductionOrderFiltersData = useMemo(
    () => ({
      status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as ProductionOrderFiltersData["status"]),
      search: searchQuery || undefined,
    }),
    [statusFilter, searchQuery],
  );

  // Data fetching
  const { data: ordersData, isLoading, refetch } = useProductionOrders(filters);

  const syncProductsMutation = useSyncFinishedGoods();
  const syncEmployeesMutation = useSyncEmployees();

  const orders = ordersData?.data ?? [];

  // Handlers
  const handleNewOrder = () => {
    setSelectedOrderId(null);
    setIsPanelOpen(true);
  };

  const handleEditOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsPanelOpen(true);
  };

  const handleSyncAll = async () => {
    try {
      // Sync products and employees in parallel
      await Promise.all([
        syncProductsMutation.mutateAsync(),
        syncEmployeesMutation.mutateAsync(undefined),
      ]);
      refetch();
    } catch (error) {
      console.error("Sync failed:", error);
    }
  };

  const isSyncing =
    syncProductsMutation.isPending || syncEmployeesMutation.isPending;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Production Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage manufacturing orders and track production progress
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleSyncAll}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Syncing...
              </>
            ) : (
              <>
                <SyncIcon className="mr-2 h-4 w-4" />
                Sync from Odoo
              </>
            )}
          </Button>
          <Button variant="primary" onClick={handleNewOrder}>
            <PlusIcon className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex-1">
            <input
              type="search"
              placeholder="Search by order number or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
      </Card>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-12 text-center">
          <FactoryIcon className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">
            No production orders
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {searchQuery || statusFilter !== "all"
              ? "No orders match your filters"
              : "Get started by creating a new production order"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleNewOrder}
            >
              Create First Order
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card
              key={order.id}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleEditOrder(order.id)}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                {/* Order Info */}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {order.order_number}
                    </h3>
                    <ProductionOrderStatusBadge status={order.status} />
                    {order.odoo_production_id && (
                      <Badge variant="success" className="text-xs">
                        <CheckIcon className="mr-1 h-3 w-3" />
                        Odoo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {order.finished_good?.name ?? "Unknown Product"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Planned:{" "}
                      <strong>
                        {order.planned_quantity?.toLocaleString() ?? 0}
                      </strong>
                    </span>
                    <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
                      |
                    </span>
                    <span>
                      Actual:{" "}
                      <strong>
                        {(order.actual_quantity ?? 0).toLocaleString()}
                      </strong>
                    </span>
                    <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
                      |
                    </span>
                    <span>
                      {order.scheduled_date
                        ? new Date(order.scheduled_date).toLocaleDateString(
                            "en-IN",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        : "No date"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditOrder(order.id);
                    }}
                  >
                    View
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Slide-out Panel */}
      <ProductionOrderPanel
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setSelectedOrderId(null);
        }}
        orderId={selectedOrderId}
        onOrderCreated={() => {
          refetch();
          setIsPanelOpen(false);
          setSelectedOrderId(null);
        }}
      />
    </>
  );
}

// Icon Components
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function FactoryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}
