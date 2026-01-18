"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Spinner } from "@maiyuri/ui";
import {
  useFinishedGoods,
  useEmployees,
  useBOM,
  useRefreshBOM,
  useCreateProductionOrder,
  useUpdateProductionOrder,
  useProductionOrder,
  useSyncToOdoo,
  calculateExpectedConsumption,
} from "@/hooks/useProduction";
import { useSubmitForApproval } from "@/hooks/useTickets";
import { FinishedGoodSelector } from "./FinishedGoodSelector";
import { ShiftAttendanceInput } from "./ShiftAttendanceInput";
import { RawMaterialConsumption } from "./RawMaterialConsumption";
import {
  SubmitForApprovalModal,
  TicketStatusBadge,
  TicketPriorityBadge,
} from "@/components/approvals";
import type {
  FinishedGood,
  ProductionOrder,
  TicketPriority,
} from "@maiyuri/shared";

interface ProductionOrderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string | null;
  onOrderCreated?: (order: ProductionOrder) => void;
}

interface ShiftRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  employeeIds: string[];
}

interface MaterialLine {
  materialId: string;
  materialName: string;
  expectedQty: number;
  actualQty: number;
  uom: string;
}

export function ProductionOrderPanel({
  isOpen,
  onClose,
  orderId,
  onOrderCreated,
}: ProductionOrderPanelProps) {
  // Data fetching
  const { data: finishedGoodsData, isLoading: loadingGoods } =
    useFinishedGoods();
  const { data: employeesData, isLoading: loadingEmployees } = useEmployees();
  const { data: orderData, isLoading: loadingOrder } = useProductionOrder(
    orderId ?? null,
  );

  const finishedGoods = finishedGoodsData?.data ?? [];
  const employees = employeesData?.data ?? [];
  const existingOrder = orderData?.data;

  // Form State
  const [selectedGood, setSelectedGood] = useState<FinishedGood | null>(null);
  const [productionQty, setProductionQty] = useState<number>(0);
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([]);
  const [notes, setNotes] = useState("");

  // Fetch BOM when good is selected
  const {
    data: bomData,
    isLoading: loadingBOM,
    refetch: refetchBOM,
  } = useBOM(selectedGood?.id ?? null);
  const bomLines = bomData?.data ?? [];

  // Mutations
  const createMutation = useCreateProductionOrder();
  const updateMutation = useUpdateProductionOrder();
  const refreshBOMMutation = useRefreshBOM();
  const syncToOdooMutation = useSyncToOdoo();
  const submitForApprovalMutation = useSubmitForApproval();

  // Submit for approval modal state
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Handler to refresh BOM from Odoo
  const handleRefreshBOM = async () => {
    if (!selectedGood?.id) return;
    try {
      await refreshBOMMutation.mutateAsync(selectedGood.id);
      refetchBOM();
    } catch (error) {
      console.error("Failed to refresh BOM:", error);
    }
  };

  // Handler to sync order to Odoo
  const handleSyncToOdoo = async () => {
    if (!orderId) return;
    try {
      await syncToOdooMutation.mutateAsync({
        orderId,
        includeAttendance: true,
      });
    } catch (error) {
      console.error("Failed to sync to Odoo:", error);
    }
  };

  // Handler to submit order for approval
  const handleSubmitForApproval = async (data: {
    priority: TicketPriority;
    notes?: string;
    due_date?: string;
  }) => {
    if (!orderId) return;
    try {
      await submitForApprovalMutation.mutateAsync({
        orderId,
        data: {
          priority: data.priority,
          notes: data.notes,
          due_date: data.due_date,
        },
      });
      setShowSubmitModal(false);
    } catch (error) {
      console.error("Failed to submit for approval:", error);
    }
  };

  // Check if order can be submitted for approval (draft status and not yet synced)
  const canSubmitForApproval =
    existingOrder &&
    existingOrder.status === "draft" &&
    !existingOrder.odoo_production_id;

  // Check if order is pending approval
  const isPendingApproval = existingOrder?.status === "pending_approval";

  // Check if order is approved (can be synced to Odoo manually if needed)
  const isApproved = existingOrder?.status === "approved";

  // Check if order can be synced to Odoo (approved but not yet synced - for manual sync if needed)
  const canSyncToOdoo =
    existingOrder &&
    existingOrder.status === "approved" &&
    !existingOrder.odoo_production_id;

  // Auto-calculate material requirements when good/qty changes
  useEffect(() => {
    if (selectedGood && productionQty > 0 && bomLines.length > 0) {
      const bomQuantity = selectedGood.bom_quantity ?? 1;
      const calculated = calculateExpectedConsumption(
        productionQty,
        bomQuantity,
        bomLines,
      );

      const materials: MaterialLine[] = calculated.map((line) => ({
        materialId: line.raw_material_id,
        materialName: line.raw_material?.name ?? "Unknown Material",
        expectedQty: line.expected_quantity,
        actualQty: line.expected_quantity, // Default to expected
        uom: line.uom_name ?? "units",
      }));

      setMaterialLines(materials);
    } else if (!selectedGood || productionQty <= 0) {
      setMaterialLines([]);
    }
  }, [selectedGood, productionQty, bomLines]);

  // Populate form if editing existing order
  useEffect(() => {
    if (existingOrder && finishedGoods.length > 0) {
      const good = finishedGoods.find(
        (g) => g.id === existingOrder.finished_good_id,
      );
      if (good) setSelectedGood(good);
      setProductionQty(existingOrder.planned_quantity ?? 0);
      setScheduledDate(
        existingOrder.scheduled_date?.split("T")[0] ??
          new Date().toISOString().split("T")[0],
      );
      setNotes(existingOrder.notes ?? "");

      // TODO: Populate shifts and material lines from existing order
      // This would require additional data fetching for shifts
    }
  }, [existingOrder, finishedGoods]);

  // Reset form when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedGood(null);
      setProductionQty(0);
      setScheduledDate(new Date().toISOString().split("T")[0]);
      setShifts([]);
      setMaterialLines([]);
      setNotes("");
    }
  }, [isOpen]);

  // Handlers
  const handleAddShift = useCallback(() => {
    const newShift: ShiftRecord = {
      id: `temp-${Date.now()}`,
      date: scheduledDate,
      startTime: "08:00",
      endTime: null,
      employeeIds: [],
    };
    setShifts((prev) => [...prev, newShift]);
  }, [scheduledDate]);

  const handleUpdateShift = useCallback(
    (shiftId: string, updates: Partial<ShiftRecord>) => {
      setShifts((prev) =>
        prev.map((s) => (s.id === shiftId ? { ...s, ...updates } : s)),
      );
    },
    [],
  );

  const handleRemoveShift = useCallback((shiftId: string) => {
    setShifts((prev) => prev.filter((s) => s.id !== shiftId));
  }, []);

  const handleUpdateMaterialActual = useCallback(
    (materialId: string, actualQty: number) => {
      setMaterialLines((prev) =>
        prev.map((m) =>
          m.materialId === materialId ? { ...m, actualQty } : m,
        ),
      );
    },
    [],
  );

  const handleSubmit = async () => {
    if (!selectedGood || productionQty <= 0) {
      return;
    }

    // Build consumption lines from material lines
    const consumption_lines = materialLines.map((m) => ({
      raw_material_id: m.materialId,
      expected_quantity: m.expectedQty,
      actual_quantity: m.actualQty,
    }));

    const payload = {
      finished_good_id: selectedGood.id,
      planned_quantity: productionQty,
      scheduled_date: scheduledDate,
      notes: notes || undefined,
      consumption_lines,
    };

    try {
      if (orderId) {
        const result = await updateMutation.mutateAsync({
          id: orderId,
          data: payload,
        });
        if (result.data && onOrderCreated) {
          onOrderCreated(result.data);
        }
      } else {
        const result = await createMutation.mutateAsync(payload);
        if (result.data && onOrderCreated) {
          onOrderCreated(result.data);
        }
      }
      onClose();
    } catch (error) {
      console.error("Failed to save production order:", error);
    }
  };

  if (!isOpen) return null;

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isLoading =
    loadingGoods || loadingEmployees || (orderId && loadingOrder);
  const canSubmit = selectedGood && productionQty > 0;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FactoryIcon className="h-5 w-5 text-emerald-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {orderId ? "Edit Production Order" : "New Production Order"}
              </h2>
              {existingOrder && (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500">
                    {existingOrder.order_number}
                  </p>
                  {existingOrder.odoo_production_id ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <OdooIcon className="mr-1 h-3 w-3" />
                      Synced
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Pending Sync
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: Finished Good Selection */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    1
                  </span>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Finished Good
                  </h3>
                </div>
                <FinishedGoodSelector
                  goods={finishedGoods}
                  selectedGood={selectedGood}
                  onSelectGood={setSelectedGood}
                  disabled={!!orderId}
                />
                {selectedGood && (
                  <div className="mt-3 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <InfoIcon className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-xs text-blue-700 dark:text-blue-300">
                          <p>
                            <strong>{selectedGood.name}</strong> - BOM produces{" "}
                            <strong>
                              {selectedGood.bom_quantity?.toLocaleString() ??
                                "N/A"}
                            </strong>{" "}
                            {selectedGood.uom_name ?? "units"} per batch
                          </p>
                          {loadingBOM ? (
                            <p className="mt-1 text-slate-500">
                              Loading BOM...
                            </p>
                          ) : bomLines.length === 0 ? (
                            <p className="mt-1 text-amber-600 dark:text-amber-400">
                              No BOM lines found. Click &quot;Refresh BOM&quot;
                              to sync from Odoo.
                            </p>
                          ) : (
                            <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                              {bomLines.length} raw materials loaded
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshBOM}
                        disabled={refreshBOMMutation.isPending}
                        className="flex-shrink-0 rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50 dark:bg-blue-800 dark:text-blue-200 dark:hover:bg-blue-700"
                      >
                        {refreshBOMMutation.isPending
                          ? "Syncing..."
                          : "Refresh BOM"}
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Section 2: Production Details */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    2
                  </span>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Production Details
                  </h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Production Quantity
                    </label>
                    <input
                      type="number"
                      value={productionQty || ""}
                      onChange={(e) =>
                        setProductionQty(parseInt(e.target.value) || 0)
                      }
                      min={1}
                      disabled={!selectedGood}
                      placeholder="Enter quantity"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white disabled:opacity-50"
                    />
                    {selectedGood && (
                      <p className="mt-1 text-xs text-slate-500">
                        Units: {selectedGood.uom_name ?? "pieces"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Scheduled Date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </Card>

              {/* Section 3: Shift & Attendance */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    3
                  </span>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Shift & Attendance
                  </h3>
                </div>
                <ShiftAttendanceInput
                  shifts={shifts}
                  employees={employees}
                  onAddShift={handleAddShift}
                  onUpdateShift={handleUpdateShift}
                  onRemoveShift={handleRemoveShift}
                />
              </Card>

              {/* Section 4: Raw Material Consumption */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    4
                  </span>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Raw Material Consumption
                  </h3>
                </div>
                <RawMaterialConsumption
                  materials={materialLines}
                  onUpdateActual={handleUpdateMaterialActual}
                />
              </Card>

              {/* Section 5: Notes */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    5
                  </span>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Notes
                  </h3>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any production notes, quality observations, or special instructions..."
                  rows={3}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </Card>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex flex-col gap-3">
            {/* Status messages */}
            {isPendingApproval && (
              <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-900/20">
                <div className="flex items-center gap-2">
                  <ApprovalPendingIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                      Pending Approval
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      This order is awaiting approval from an authorized
                      reviewer.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isApproved && !existingOrder?.odoo_production_id && (
              <div className="rounded-md bg-green-50 p-3 dark:bg-green-900/20">
                <div className="flex items-center gap-2">
                  <ApprovalApprovedIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      Approved
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      This order has been approved and will be synced to Odoo
                      automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit for Approval Button - Only for draft orders */}
            {canSubmitForApproval && (
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => setShowSubmitModal(true)}
                disabled={submitForApprovalMutation.isPending}
              >
                {submitForApprovalMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ApprovalIcon className="mr-2 h-4 w-4" />
                    Submit for Approval
                  </>
                )}
              </Button>
            )}

            {/* Manual Sync to Odoo Button - Only for approved orders not yet synced (fallback) */}
            {canSyncToOdoo && (
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleSyncToOdoo}
                disabled={syncToOdooMutation.isPending}
              >
                {syncToOdooMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Syncing to Odoo...
                  </>
                ) : (
                  <>
                    <OdooIcon className="mr-2 h-4 w-4" />
                    Manual Sync to Odoo
                  </>
                )}
              </Button>
            )}

            {/* Success/Error messages */}
            {submitForApprovalMutation.isSuccess && (
              <div className="rounded-md bg-blue-50 p-2 text-center text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                Successfully submitted for approval!
              </div>
            )}
            {submitForApprovalMutation.isError && (
              <div className="rounded-md bg-red-50 p-2 text-center text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                Failed to submit:{" "}
                {submitForApprovalMutation.error?.message ?? "Unknown error"}
              </div>
            )}
            {syncToOdooMutation.isSuccess && (
              <div className="rounded-md bg-emerald-50 p-2 text-center text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                Successfully synced to Odoo!
              </div>
            )}
            {syncToOdooMutation.isError && (
              <div className="rounded-md bg-red-50 p-2 text-center text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                Failed to sync:{" "}
                {syncToOdooMutation.error?.message ?? "Unknown error"}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="primary"
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting || isPendingApproval}
              >
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <SaveIcon className="mr-2 h-4 w-4" />
                    {orderId ? "Update Order" : "Create Order"}
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>

        {/* Submit for Approval Modal */}
        <SubmitForApprovalModal
          isOpen={showSubmitModal}
          onClose={() => setShowSubmitModal(false)}
          onSubmit={handleSubmitForApproval}
          isLoading={submitForApprovalMutation.isPending}
          orderNumber={existingOrder?.order_number ?? "New Order"}
        />
      </div>
    </div>
  );
}

// Icon Components
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

function CloseIcon({ className }: { className?: string }) {
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
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
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>
  );
}

function OdooIcon({ className }: { className?: string }) {
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
        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

function ApprovalIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ApprovalPendingIcon({ className }: { className?: string }) {
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
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ApprovalApprovedIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
      />
    </svg>
  );
}
