import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  FinishedGood,
  RawMaterial,
  BOMLine,
  Employee,
  ProductionOrder,
  ProductionShift,
  ProductionConsumptionLine,
  CreateProductionOrderData,
  UpdateProductionOrderData,
  ProductionOrderFiltersData,
  CreateShiftData,
  UpdateShiftData,
  UpdateConsumptionLineData,
} from "@maiyuri/shared";

// ============================================
// API Response Types
// ============================================

interface ApiResponse<T> {
  data: T;
  error?: string;
  meta?: { total?: number };
}

interface SyncResponse {
  total?: number;
  synced?: number;
  failed?: number;
}

// ============================================
// Finished Goods API
// ============================================

async function fetchFinishedGoods(): Promise<ApiResponse<FinishedGood[]>> {
  const res = await fetch("/api/production/finished-goods");
  if (!res.ok) throw new Error("Failed to fetch finished goods");
  return res.json();
}

async function syncFinishedGoods(): Promise<ApiResponse<SyncResponse>> {
  const res = await fetch("/api/production/finished-goods", {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to sync finished goods");
  }
  return res.json();
}

export function useFinishedGoods() {
  return useQuery({
    queryKey: ["finished-goods"],
    queryFn: fetchFinishedGoods,
  });
}

export function useSyncFinishedGoods() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncFinishedGoods,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finished-goods"] });
    },
  });
}

// ============================================
// BOM API
// ============================================

async function fetchBOMLines(
  finishedGoodId: string,
): Promise<ApiResponse<BOMLine[]>> {
  const res = await fetch(`/api/production/bom/${finishedGoodId}`);
  if (!res.ok) throw new Error("Failed to fetch BOM lines");
  return res.json();
}

async function refreshBOMFromOdoo(
  finishedGoodId: string,
): Promise<ApiResponse<BOMLine[]>> {
  const res = await fetch(`/api/production/bom/${finishedGoodId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to refresh BOM");
  }
  return res.json();
}

export function useBOM(finishedGoodId: string | null) {
  return useQuery({
    queryKey: ["bom", finishedGoodId],
    queryFn: () => fetchBOMLines(finishedGoodId!),
    enabled: !!finishedGoodId,
  });
}

export function useRefreshBOM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshBOMFromOdoo,
    onSuccess: (_, finishedGoodId) => {
      queryClient.invalidateQueries({ queryKey: ["bom", finishedGoodId] });
    },
  });
}

// ============================================
// Employees API
// ============================================

async function fetchEmployees(
  department?: string,
): Promise<ApiResponse<Employee[]>> {
  const url = department
    ? `/api/production/employees?department=${encodeURIComponent(department)}`
    : "/api/production/employees";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch employees");
  return res.json();
}

async function syncEmployees(
  department?: string,
): Promise<ApiResponse<SyncResponse>> {
  const res = await fetch("/api/production/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to sync employees");
  }
  return res.json();
}

export function useEmployees(department?: string) {
  return useQuery({
    queryKey: department ? ["employees", department] : ["employees"],
    queryFn: () => fetchEmployees(department),
  });
}

export function useSyncEmployees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncEmployees,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

// ============================================
// Production Orders API
// ============================================

async function fetchProductionOrders(
  filters?: ProductionOrderFiltersData,
): Promise<ApiResponse<ProductionOrder[]>> {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.finished_good_id)
    params.append("finished_good_id", filters.finished_good_id);
  if (filters?.from_date) params.append("from_date", filters.from_date);
  if (filters?.to_date) params.append("to_date", filters.to_date);
  if (filters?.odoo_sync_status)
    params.append("odoo_sync_status", filters.odoo_sync_status);
  if (filters?.search) params.append("search", filters.search);

  const url = params.toString()
    ? `/api/production/orders?${params.toString()}`
    : "/api/production/orders";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch production orders");
  return res.json();
}

async function fetchProductionOrder(
  id: string,
): Promise<ApiResponse<ProductionOrder>> {
  const res = await fetch(`/api/production/orders/${id}`);
  if (!res.ok) throw new Error("Failed to fetch production order");
  return res.json();
}

async function createProductionOrder(
  data: CreateProductionOrderData,
): Promise<ApiResponse<ProductionOrder>> {
  const res = await fetch("/api/production/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create production order");
  }
  return res.json();
}

async function updateProductionOrder(
  id: string,
  data: UpdateProductionOrderData,
): Promise<ApiResponse<ProductionOrder>> {
  const res = await fetch(`/api/production/orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update production order");
  }
  return res.json();
}

async function deleteProductionOrder(id: string): Promise<void> {
  const res = await fetch(`/api/production/orders/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to delete production order");
  }
}

export function useProductionOrders(filters?: ProductionOrderFiltersData) {
  return useQuery({
    queryKey: ["production-orders", filters],
    queryFn: () => fetchProductionOrders(filters),
  });
}

export function useProductionOrder(id: string | null) {
  return useQuery({
    queryKey: ["production-order", id],
    queryFn: () => fetchProductionOrder(id!),
    enabled: !!id,
  });
}

export function useCreateProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProductionOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

export function useUpdateProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateProductionOrderData;
    }) => updateProductionOrder(id, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["production-order", response.data?.id],
      });
    },
  });
}

export function useDeleteProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProductionOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

// ============================================
// Sync to Odoo API
// ============================================

interface SyncToOdooResponse {
  odooProductionId: number;
  attendance?: Array<{ shiftId: string; synced: number; failed: number }>;
  message: string;
}

async function syncToOdoo(
  orderId: string,
  includeAttendance: boolean = true,
): Promise<ApiResponse<SyncToOdooResponse>> {
  const res = await fetch(`/api/production/orders/${orderId}/sync-to-odoo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ include_attendance: includeAttendance }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to sync to Odoo");
  }
  return res.json();
}

export function useSyncToOdoo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      includeAttendance = true,
    }: {
      orderId: string;
      includeAttendance?: boolean;
    }) => syncToOdoo(orderId, includeAttendance),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["production-order", variables.orderId],
      });
    },
  });
}

// ============================================
// Shifts API
// ============================================

async function fetchShifts(
  orderId: string,
): Promise<ApiResponse<ProductionShift[]>> {
  const res = await fetch(`/api/production/shifts?order_id=${orderId}`);
  if (!res.ok) throw new Error("Failed to fetch shifts");
  return res.json();
}

async function createShift(
  data: CreateShiftData,
): Promise<ApiResponse<ProductionShift>> {
  const res = await fetch("/api/production/shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create shift");
  }
  return res.json();
}

async function updateShift(
  id: string,
  data: UpdateShiftData,
): Promise<ApiResponse<ProductionShift>> {
  const res = await fetch(`/api/production/shifts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update shift");
  }
  return res.json();
}

async function deleteShift(id: string): Promise<void> {
  const res = await fetch(`/api/production/shifts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to delete shift");
  }
}

export function useShifts(orderId: string | null) {
  return useQuery({
    queryKey: ["shifts", orderId],
    queryFn: () => fetchShifts(orderId!),
    enabled: !!orderId,
  });
}

export function useCreateShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createShift,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["shifts", variables.production_order_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["production-order", variables.production_order_id],
      });
    },
  });
}

export function useUpdateShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateShiftData }) =>
      updateShift(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

export function useEndShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shiftId, endTime }: { shiftId: string; endTime: string }) =>
      updateShift(shiftId, { end_time: endTime, status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

export function useDeleteShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

// ============================================
// Consumption Lines API
// ============================================

async function updateConsumptionLine(
  lineId: string,
  data: UpdateConsumptionLineData,
): Promise<ApiResponse<ProductionConsumptionLine>> {
  const res = await fetch(`/api/production/consumption/${lineId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update consumption");
  }
  return res.json();
}

export function useUpdateConsumptionLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      lineId,
      data,
    }: {
      lineId: string;
      data: UpdateConsumptionLineData;
    }) => updateConsumptionLine(lineId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

// ============================================
// Attendance Sync API
// ============================================

interface AttendanceSyncResponse {
  odooAttendanceId: number;
  message: string;
}

async function syncAttendanceToOdoo(
  attendanceId: string,
): Promise<ApiResponse<AttendanceSyncResponse>> {
  const res = await fetch(`/api/production/attendance/${attendanceId}/sync`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to sync attendance");
  }
  return res.json();
}

export function useSyncAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncAttendanceToOdoo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

// ============================================
// Consumption Calculation (Client-side)
// ============================================

/**
 * Calculate expected consumption quantities based on BOM
 * Formula: (plannedQty / bomQty) * lineQty
 */
export function calculateExpectedConsumption(
  plannedQuantity: number,
  bomQuantity: number,
  bomLines: BOMLine[],
): Array<{
  raw_material_id: string;
  expected_quantity: number;
  uom_name: string | null;
  raw_material?: RawMaterial;
}> {
  if (!bomQuantity || bomQuantity === 0) return [];

  const multiplier = plannedQuantity / bomQuantity;

  return bomLines.map((line) => ({
    raw_material_id: line.raw_material_id,
    expected_quantity:
      Math.round(line.quantity_per_bom * multiplier * 10000) / 10000,
    uom_name: line.uom_name,
    raw_material: line.raw_material as RawMaterial | undefined,
  }));
}

/**
 * Calculate difference between expected and actual consumption
 * Positive = over-consumed, Negative = under-consumed
 */
export function calculateConsumptionDifference(
  expected: number,
  actual: number | null,
): number | null {
  if (actual === null || actual === undefined) return null;
  return Math.round((actual - expected) * 10000) / 10000;
}
