# Production Module UI Design Specification

**Designer:** Designer Agent
**Date:** 2026-01-18
**Status:** Production-Ready Design
**Design System:** Maiyuri Bricks Design System (Tailwind CSS, shadcn/ui)

---

## Table of Contents

1. [Design System Reference](#design-system-reference)
2. [Component Architecture](#component-architecture)
3. [Screen 1: Production Orders List](#screen-1-production-orders-list)
4. [Screen 2: Production Order Form (Slide-out Panel)](#screen-2-production-order-form-slide-out-panel)
5. [Screen 3: Order Detail View](#screen-3-order-detail-view)
6. [Accessibility & Responsiveness](#accessibility--responsiveness)
7. [Implementation Checklist](#implementation-checklist)

---

## Design System Reference

### Color Palette (from globals.css)

```css
/* Primary Actions */
--color-primary: 59 130 246; /* blue-500 */
--emerald-accent: 16 185 129; /* emerald-500 - NEW for production module */

/* Status Colors */
--status-draft: 148 163 184; /* slate-400 */
--status-confirmed: 59 130 246; /* blue-500 */
--status-in-progress: 234 179 8; /* yellow-500 */
--status-done: 34 197 94; /* green-500 */
--status-cancelled: 239 68 68; /* red-500 */

/* Backgrounds */
--color-bg: 255 255 255;
--color-bg-card: 255 255 255;
--color-border: 226 232 240; /* slate-200 */
```

### Typography Scale

- **Page Title (H1):** `text-2xl font-bold text-slate-900 dark:text-white`
- **Section Title (H2):** `text-lg font-semibold text-slate-900 dark:text-white`
- **Card Title (H3):** `text-base font-medium text-slate-900 dark:text-white`
- **Body Text:** `text-sm text-slate-600 dark:text-slate-300`
- **Caption:** `text-xs text-slate-500 dark:text-slate-400`

### Spacing

- **Section Gap:** `space-y-6` (24px)
- **Card Padding:** `p-4` (16px) or `p-6` (24px)
- **Grid Gap:** `gap-3` (12px) or `gap-4` (16px)

### Components from @maiyuri/ui

- `Button` (variants: primary, secondary, danger, ghost)
- `Card`
- `Badge`
- `Spinner`
- `Input`
- `Select`
- `Textarea`

---

## Component Architecture

### File Structure

```
apps/web/src/
├── components/
│   └── production/
│       ├── ProductionOrdersList.tsx          # Main list page component
│       ├── ProductionOrderPanel.tsx          # Slide-out form panel
│       ├── ProductionOrderDetail.tsx         # Detail view component
│       ├── FinishedGoodSelector.tsx          # Finished goods grid selector
│       ├── ShiftAttendanceInput.tsx          # Shift & attendance section
│       ├── RawMaterialConsumption.tsx        # Material consumption table
│       └── ProductionOrderStatusBadge.tsx    # Status badge component
├── hooks/
│   └── useProduction.ts                      # Production-related hooks
└── app/
    └── production/
        ├── page.tsx                          # /production route
        └── [id]/
            └── page.tsx                      # /production/[id] route
```

### State Management Approach

**TanStack Query for Server State:**

- `useProductionOrders()` - List with filters
- `useProductionOrder(id)` - Single order
- `useFinishedGoods()` - Products with BOMs
- `useEmployees()` - Factory workers list
- `useCreateProductionOrder()` - Create mutation
- `useUpdateProductionOrder()` - Update mutation
- `useSyncToOdoo()` - Sync mutation

**Local State (useState):**

- Form inputs (quantity, dates, notes)
- Selected finished good
- Line items (material consumption)
- Shift records
- Panel open/close state

---

## Screen 1: Production Orders List

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Production Orders                    [+ New Order] [↻ Sync] │
├─────────────────────────────────────────────────────────────┤
│  Filters: [Status ▼] [Date Range Picker]      [Search...]   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ MO-2026-0001  │ 6" Mud Interlock     │ Draft   │ Odoo │  │
│  │ Jan 18, 2026  │ Planned: 5000        │ [View]  │  ✓   │  │
│  │               │ Actual: 0            │         │      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ MO-2026-0002  │ Cement Hollow Block  │ In Prog │ Odoo │  │
│  │ Jan 17, 2026  │ Planned: 3000        │ [View]  │  ✓   │  │
│  │               │ Actual: 2100         │         │      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Code Structure

```tsx
"use client";

import { useState } from "react";
import { Card, Button, Badge, Spinner } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import { useProductionOrders, useSyncAllFromOdoo } from "@/hooks/useProduction";
import { ProductionOrderPanel } from "./ProductionOrderPanel";
import { ProductionOrderStatusBadge } from "./ProductionOrderStatusBadge";

interface ProductionOrdersListProps {
  // Optional filters from URL params
  initialStatus?: string;
  initialDateRange?: { from: Date; to: Date };
}

export function ProductionOrdersList({
  initialStatus,
  initialDateRange,
}: ProductionOrdersListProps) {
  // State
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "all");
  const [dateRange, setDateRange] = useState(initialDateRange ?? null);
  const [searchQuery, setSearchQuery] = useState("");

  // Data fetching
  const {
    data: ordersData,
    isLoading,
    refetch,
  } = useProductionOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    dateFrom: dateRange?.from,
    dateTo: dateRange?.to,
    search: searchQuery,
  });

  const syncMutation = useSyncAllFromOdoo();

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
    await syncMutation.mutateAsync();
    refetch();
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
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
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
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
        <div className="flex items-center gap-4">
          <div className="w-48">
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
              <div className="flex items-start justify-between">
                {/* Order Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {order.order_number}
                    </h3>
                    <ProductionOrderStatusBadge status={order.status} />
                    {order.odoo_synced_at && (
                      <Badge variant="success" className="text-xs">
                        <CheckIcon className="mr-1 h-3 w-3" />
                        Odoo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {order.finished_good_name}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Planned:{" "}
                      <strong>{order.planned_qty.toLocaleString()}</strong>{" "}
                      {order.uom}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">
                      •
                    </span>
                    <span>
                      Actual:{" "}
                      <strong>
                        {(order.actual_qty ?? 0).toLocaleString()}
                      </strong>{" "}
                      {order.uom}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">
                      •
                    </span>
                    <span>
                      {new Date(order.scheduled_date).toLocaleDateString(
                        "en-IN",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="ml-4 flex items-center gap-2">
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
        }}
      />
    </>
  );
}

// Icon Components (inline SVGs following existing pattern)
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
```

### Props Interface

```typescript
interface ProductionOrder {
  id: string;
  order_number: string; // MO-2026-0001
  finished_good_id: string;
  finished_good_name: string;
  planned_qty: number;
  actual_qty: number | null;
  uom: string; // Unit of Measure (pcs, tons, etc.)
  scheduled_date: string; // ISO date
  status: "draft" | "confirmed" | "in_progress" | "done" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  odoo_synced_at: string | null;
  odoo_mo_id: number | null;
}
```

### Tailwind Classes Summary

| Element            | Classes                                                  |
| ------------------ | -------------------------------------------------------- |
| Page Container     | `space-y-6`                                              |
| Header Title       | `text-2xl font-bold text-slate-900 dark:text-white`      |
| Header Description | `text-sm text-slate-500 dark:text-slate-400`             |
| Button Group       | `flex gap-3`                                             |
| Filter Card        | `p-4` with `flex items-center gap-4`                     |
| Order Card         | `p-4 hover:shadow-md transition-shadow cursor-pointer`   |
| Order Number       | `text-base font-semibold text-slate-900 dark:text-white` |
| Order Meta         | `text-xs text-slate-500 dark:text-slate-400`             |

---

## Screen 2: Production Order Form (Slide-out Panel)

### Layout Structure (Mobile-First, Desktop-Optimized)

```
┌────────────────────────────────────────┐
│  Production Order         [×]           │
├────────────────────────────────────────┤
│                                         │
│  1️⃣ FINISHED GOOD                       │
│  ┌──────────────────────────────────┐  │
│  │ [Category Tabs]                  │  │
│  │ ┌────────┐ ┌────────┐ ┌────────┐ │  │
│  │ │6" Mud  │ │8" Mud  │ │Cement  │ │  │
│  │ │Block   │ │Block   │ │Hollow  │ │  │
│  │ │✓       │ │        │ │        │ │  │
│  │ └────────┘ └────────┘ └────────┘ │  │
│  └──────────────────────────────────┘  │
│                                         │
│  2️⃣ PRODUCTION DETAILS                  │
│  Production Quantity: [5000  ] pcs     │
│  Scheduled Date: [Jan 18, 2026]        │
│  ℹ️ BOM produces 5000 units per batch   │
│                                         │
│  3️⃣ SHIFT & ATTENDANCE                  │
│  ┌──────────────────────────────────┐  │
│  │ Shift 1 - Jan 18, 2026           │  │
│  │ Start: [08:00] End: [16:00]      │  │
│  │                                   │  │
│  │ Factory Workers:                  │  │
│  │ ☑ Azjzul sekh                    │  │
│  │ ☑ Ferai Sekh                     │  │
│  │ ☐ Mohammad Hassan                │  │
│  │ ☐ SK Romjan                      │  │
│  └──────────────────────────────────┘  │
│  [+ Add Shift]                         │
│                                         │
│  4️⃣ RAW MATERIAL CONSUMPTION            │
│  ┌──────────────────────────────────┐  │
│  │ Material     Expected  Actual     │  │
│  │ Cement       500 kg   [480] -20  │  │
│  │ Sand         2000 kg  [2000]  0  │  │
│  │ Aggregate    1500 kg  [1520] +20 │  │
│  └──────────────────────────────────┘  │
│                                         │
│  5️⃣ NOTES                                │
│  [Textarea for optional notes...]      │
│                                         │
├────────────────────────────────────────┤
│  [Cancel]          [Create Order]      │
└────────────────────────────────────────┘
```

### Component Code Structure

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, Button, Input, Textarea, Spinner, Badge } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import {
  useFinishedGoods,
  useEmployees,
  useCreateProductionOrder,
  useUpdateProductionOrder,
  useProductionOrder,
} from "@/hooks/useProduction";
import { FinishedGoodSelector } from "./FinishedGoodSelector";
import { ShiftAttendanceInput } from "./ShiftAttendanceInput";
import { RawMaterialConsumption } from "./RawMaterialConsumption";

interface ProductionOrderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string | null; // For edit mode
  onOrderCreated?: (order: ProductionOrder) => void;
}

interface ShiftRecord {
  id: string; // Temp ID for UI
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string | null; // HH:mm or null if ongoing
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
  const { data: finishedGoodsData } = useFinishedGoods();
  const { data: employeesData } = useEmployees({ role: "factory_worker" });
  const { data: orderData } = useProductionOrder(orderId ?? undefined, {
    enabled: !!orderId,
  });

  const createMutation = useCreateProductionOrder();
  const updateMutation = useUpdateProductionOrder();

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

  // Auto-calculate material requirements when good/qty changes
  useEffect(() => {
    if (selectedGood && productionQty > 0) {
      const bom = selectedGood.bom_lines ?? [];
      const calculatedMaterials: MaterialLine[] = bom.map((line) => ({
        materialId: line.product_id,
        materialName: line.product_name,
        expectedQty: (line.quantity * productionQty) / selectedGood.bom_qty,
        actualQty: (line.quantity * productionQty) / selectedGood.bom_qty,
        uom: line.uom,
      }));
      setMaterialLines(calculatedMaterials);
    }
  }, [selectedGood, productionQty]);

  // Populate form if editing existing order
  useEffect(() => {
    if (existingOrder) {
      // Populate from existing order
      const good = finishedGoods.find(
        (g) => g.id === existingOrder.finished_good_id,
      );
      if (good) setSelectedGood(good);
      setProductionQty(existingOrder.planned_qty);
      setScheduledDate(existingOrder.scheduled_date.split("T")[0]);
      setShifts(existingOrder.shifts ?? []);
      setMaterialLines(existingOrder.material_lines ?? []);
      setNotes(existingOrder.notes ?? "");
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
  const handleAddShift = () => {
    const newShift: ShiftRecord = {
      id: `temp-${Date.now()}`,
      date: scheduledDate,
      startTime: "08:00",
      endTime: null,
      employeeIds: [],
    };
    setShifts([...shifts, newShift]);
  };

  const handleUpdateShift = (
    shiftId: string,
    updates: Partial<ShiftRecord>,
  ) => {
    setShifts(shifts.map((s) => (s.id === shiftId ? { ...s, ...updates } : s)));
  };

  const handleRemoveShift = (shiftId: string) => {
    setShifts(shifts.filter((s) => s.id !== shiftId));
  };

  const handleUpdateMaterialActual = (
    materialId: string,
    actualQty: number,
  ) => {
    setMaterialLines(
      materialLines.map((m) =>
        m.materialId === materialId ? { ...m, actualQty } : m,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!selectedGood || productionQty <= 0) {
      return;
    }

    const payload = {
      finished_good_id: selectedGood.id,
      planned_qty: productionQty,
      scheduled_date: scheduledDate,
      shifts,
      material_lines: materialLines,
      notes: notes || undefined,
    };

    try {
      if (orderId) {
        const result = await updateMutation.mutateAsync({
          orderId,
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
                <p className="text-sm text-slate-500">
                  {existingOrder.order_number}
                </p>
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
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
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
              />
              {selectedGood && (
                <div className="mt-3 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
                  <div className="flex items-start gap-2">
                    <InfoIcon className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>{selectedGood.name}</strong> - BOM produces{" "}
                      <strong>{selectedGood.bom_qty.toLocaleString()}</strong>{" "}
                      {selectedGood.uom} per batch
                    </p>
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
                <Input
                  type="number"
                  label="Production Quantity"
                  value={productionQty || ""}
                  onChange={(e) =>
                    setProductionQty(parseInt(e.target.value) || 0)
                  }
                  min={1}
                  helperText={selectedGood ? `Units: ${selectedGood.uom}` : ""}
                  disabled={!selectedGood}
                />
                <Input
                  type="date"
                  label="Scheduled Date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
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
            {materialLines.length > 0 && (
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
            )}

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
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any production notes, quality observations, or special instructions..."
                rows={3}
              />
            </Card>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex gap-3">
            <Button
              className="flex-1"
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
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
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
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
```

### Sub-Components

#### FinishedGoodSelector.tsx

```tsx
"use client";

import { useState } from "react";
import { cn } from "@maiyuri/ui";

interface FinishedGood {
  id: string;
  name: string;
  category: string;
  bom_qty: number;
  uom: string;
}

interface FinishedGoodSelectorProps {
  goods: FinishedGood[];
  selectedGood: FinishedGood | null;
  onSelectGood: (good: FinishedGood) => void;
}

const categoryLabels: Record<string, string> = {
  mud_interlock: "Mud Interlock",
  cement_interlock: "Cement Interlock",
  cement_blocks: "Cement Blocks",
  project: "Projects",
};

export function FinishedGoodSelector({
  goods,
  selectedGood,
  onSelectGood,
}: FinishedGoodSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group by category
  const byCategory = goods.reduce(
    (acc, good) => {
      if (!acc[good.category]) acc[good.category] = [];
      acc[good.category].push(good);
      return acc;
    },
    {} as Record<string, FinishedGood[]>,
  );

  const categories = Object.keys(byCategory);

  return (
    <div>
      {/* Category Tabs */}
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() =>
              setActiveCategory(activeCategory === cat ? null : cat)
            }
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              activeCategory === cat
                ? "bg-emerald-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
            )}
          >
            {categoryLabels[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      {activeCategory && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {byCategory[activeCategory].map((good) => {
            const isSelected = selectedGood?.id === good.id;
            return (
              <button
                key={good.id}
                onClick={() => onSelectGood(good)}
                className={cn(
                  "relative rounded-lg border-2 p-3 text-left transition-all",
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600",
                )}
              >
                {isSelected && (
                  <div className="absolute right-2 top-2">
                    <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                )}
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {good.name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {good.bom_qty} {good.uom}/batch
                </p>
              </button>
            );
          })}
        </div>
      )}

      {!activeCategory && (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Select a category above to choose a finished good
        </p>
      )}
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
        clipRule="evenodd"
      />
    </svg>
  );
}
```

#### ShiftAttendanceInput.tsx

```tsx
"use client";

import { Button, Input } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";

interface Employee {
  id: string;
  name: string;
}

interface ShiftRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  employeeIds: string[];
}

interface ShiftAttendanceInputProps {
  shifts: ShiftRecord[];
  employees: Employee[];
  onAddShift: () => void;
  onUpdateShift: (shiftId: string, updates: Partial<ShiftRecord>) => void;
  onRemoveShift: (shiftId: string) => void;
}

export function ShiftAttendanceInput({
  shifts,
  employees,
  onAddShift,
  onUpdateShift,
  onRemoveShift,
}: ShiftAttendanceInputProps) {
  const handleEmployeeToggle = (shiftId: string, employeeId: string) => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    const isSelected = shift.employeeIds.includes(employeeId);
    const newEmployeeIds = isSelected
      ? shift.employeeIds.filter((id) => id !== employeeId)
      : [...shift.employeeIds, employeeId];

    onUpdateShift(shiftId, { employeeIds: newEmployeeIds });
  };

  return (
    <div className="space-y-4">
      {shifts.length === 0 && (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          No shifts added yet
        </p>
      )}

      {shifts.map((shift, index) => (
        <div
          key={shift.id}
          className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white">
              Shift {index + 1} -{" "}
              {new Date(shift.date).toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </h4>
            <button
              onClick={() => onRemoveShift(shift.id)}
              className="text-red-500 hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <Input
              type="time"
              label="Start Time"
              value={shift.startTime}
              onChange={(e) =>
                onUpdateShift(shift.id, { startTime: e.target.value })
              }
            />
            <Input
              type="time"
              label="End Time (optional)"
              value={shift.endTime ?? ""}
              onChange={(e) =>
                onUpdateShift(shift.id, { endTime: e.target.value || null })
              }
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              Factory Workers
            </p>
            <div className="grid grid-cols-2 gap-2">
              {employees.map((emp) => {
                const isSelected = shift.employeeIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleEmployeeToggle(shift.id, emp.id)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-slate-900 dark:text-white">
                      {emp.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        onClick={onAddShift}
        className="w-full"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Add Shift
      </Button>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

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
```

#### RawMaterialConsumption.tsx

```tsx
"use client";

import { Input } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";

interface MaterialLine {
  materialId: string;
  materialName: string;
  expectedQty: number;
  actualQty: number;
  uom: string;
}

interface RawMaterialConsumptionProps {
  materials: MaterialLine[];
  onUpdateActual: (materialId: string, actualQty: number) => void;
}

export function RawMaterialConsumption({
  materials,
  onUpdateActual,
}: RawMaterialConsumptionProps) {
  const getDifference = (expected: number, actual: number) => {
    const diff = actual - expected;
    return {
      value: diff,
      display: diff > 0 ? `+${diff}` : diff.toString(),
      color:
        diff > 0
          ? "text-red-600 dark:text-red-400"
          : diff < 0
            ? "text-green-600 dark:text-green-400"
            : "text-slate-500 dark:text-slate-400",
    };
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="pb-2 text-left font-medium text-slate-700 dark:text-slate-300">
              Raw Material
            </th>
            <th className="pb-2 text-right font-medium text-slate-700 dark:text-slate-300">
              Expected
            </th>
            <th className="pb-2 text-right font-medium text-slate-700 dark:text-slate-300">
              Actual
            </th>
            <th className="pb-2 text-right font-medium text-slate-700 dark:text-slate-300">
              Diff
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {materials.map((material) => {
            const diff = getDifference(
              material.expectedQty,
              material.actualQty,
            );
            return (
              <tr key={material.materialId}>
                <td className="py-3 text-slate-900 dark:text-white">
                  {material.materialName}
                </td>
                <td className="py-3 text-right text-slate-600 dark:text-slate-300">
                  {material.expectedQty.toLocaleString()} {material.uom}
                </td>
                <td className="py-3 text-right">
                  <input
                    type="number"
                    value={material.actualQty}
                    onChange={(e) =>
                      onUpdateActual(
                        material.materialId,
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    step="0.01"
                    className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </td>
                <td className={cn("py-3 text-right font-medium", diff.color)}>
                  {diff.display}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Screen 3: Order Detail View

### Layout Structure

```
┌─────────────────────────────────────────────┐
│  ← Back to Orders                            │
├─────────────────────────────────────────────┤
│                                              │
│  MO-2026-0001               [Sync to Odoo]  │
│  In Progress                [Edit]          │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │ FINISHED GOOD                        │   │
│  │ 6" Mud Interlock                     │   │
│  │ Planned: 5000 pcs | Actual: 4850 pcs │   │
│  │ Scheduled: Jan 18, 2026              │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │ SHIFT TIMELINE                       │   │
│  │                                       │   │
│  │ Jan 18, 2026                         │   │
│  │ ┌───────────────────────────────┐   │   │
│  │ │ 08:00 - 16:00                 │   │   │
│  │ │ Azjzul sekh, Ferai Sekh       │   │   │
│  │ └───────────────────────────────┘   │   │
│  │                                       │   │
│  │ Jan 19, 2026                         │   │
│  │ ┌───────────────────────────────┐   │   │
│  │ │ 08:00 - 14:30                 │   │   │
│  │ │ Mohammad Hassan, SK Romjan    │   │   │
│  │ └───────────────────────────────┘   │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │ RAW MATERIAL CONSUMPTION             │   │
│  │ Cement: 480 kg (expected: 500 kg)   │   │
│  │ Sand: 2000 kg (expected: 2000 kg)   │   │
│  │ Aggregate: 1520 kg (expected: 1500) │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │ NOTES                                │   │
│  │ Quality check completed. All units   │   │
│  │ passed inspection.                   │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  Status Actions:                            │
│  [Confirm] [Start Production] [Mark Done]   │
│                                              │
└─────────────────────────────────────────────┘
```

### Component Code Structure

```tsx
"use client";

import { Card, Button, Badge, Spinner } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import {
  useProductionOrder,
  useSyncToOdoo,
  useUpdateOrderStatus,
} from "@/hooks/useProduction";
import { ProductionOrderStatusBadge } from "./ProductionOrderStatusBadge";
import { useRouter } from "next/navigation";

interface ProductionOrderDetailProps {
  orderId: string;
}

export function ProductionOrderDetail({ orderId }: ProductionOrderDetailProps) {
  const router = useRouter();
  const { data: orderData, isLoading } = useProductionOrder(orderId);
  const syncMutation = useSyncToOdoo();
  const statusMutation = useUpdateOrderStatus();

  const order = orderData?.data;

  const handleSync = async () => {
    await syncMutation.mutateAsync({ orderId });
  };

  const handleStatusChange = async (newStatus: string) => {
    await statusMutation.mutateAsync({ orderId, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm text-slate-500">Order not found</p>
      </Card>
    );
  }

  const materialDiff = (actual: number, expected: number) => {
    const diff = actual - expected;
    return {
      value: diff,
      display: diff > 0 ? `+${diff}` : diff < 0 ? diff.toString() : "0",
      color:
        diff > 0
          ? "text-red-600 dark:text-red-400"
          : diff < 0
            ? "text-green-600 dark:text-green-400"
            : "text-slate-500",
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push("/production")}
            className="mb-2 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Orders
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {order.order_number}
            </h1>
            <ProductionOrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Created {new Date(order.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Syncing...
              </>
            ) : (
              <>
                <SyncIcon className="mr-2 h-4 w-4" />
                Sync to Odoo
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push(`/production/${orderId}/edit`)}
          >
            <PencilIcon className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Finished Good Card */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Finished Good
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Product
            </p>
            <p className="mt-1 text-base font-medium text-slate-900 dark:text-white">
              {order.finished_good_name}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Scheduled Date
            </p>
            <p className="mt-1 text-base font-medium text-slate-900 dark:text-white">
              {new Date(order.scheduled_date).toLocaleDateString("en-IN", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Planned Quantity
            </p>
            <p className="mt-1 text-base font-medium text-slate-900 dark:text-white">
              {order.planned_qty.toLocaleString()} {order.uom}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Actual Quantity
            </p>
            <p className="mt-1 text-base font-medium text-slate-900 dark:text-white">
              {(order.actual_qty ?? 0).toLocaleString()} {order.uom}
            </p>
          </div>
        </div>
      </Card>

      {/* Shift Timeline */}
      {order.shifts && order.shifts.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Shift Timeline
          </h2>
          <div className="space-y-4">
            {order.shifts.map((shift, index) => (
              <div
                key={shift.id ?? index}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {new Date(shift.date).toLocaleDateString("en-IN", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <Badge variant="default">
                    {shift.start_time} - {shift.end_time ?? "Ongoing"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {shift.employees?.map((emp) => (
                    <span
                      key={emp.id}
                      className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    >
                      {emp.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Raw Material Consumption */}
      {order.material_lines && order.material_lines.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Raw Material Consumption
          </h2>
          <div className="space-y-3">
            {order.material_lines.map((material) => {
              const diff = materialDiff(
                material.actual_qty,
                material.expected_qty,
              );
              return (
                <div
                  key={material.material_id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {material.material_name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Expected: {material.expected_qty.toLocaleString()}{" "}
                      {material.uom}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {material.actual_qty.toLocaleString()} {material.uom}
                    </p>
                    <p className={cn("text-xs font-medium", diff.color)}>
                      {diff.display !== "0" &&
                        `${diff.display} ${material.uom}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card className="p-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
            Notes
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
            {order.notes}
          </p>
        </Card>
      )}

      {/* Status Actions */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Status Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {order.status === "draft" && (
            <Button
              variant="primary"
              onClick={() => handleStatusChange("confirmed")}
              disabled={statusMutation.isPending}
            >
              Confirm Order
            </Button>
          )}
          {order.status === "confirmed" && (
            <Button
              variant="primary"
              onClick={() => handleStatusChange("in_progress")}
              disabled={statusMutation.isPending}
            >
              Start Production
            </Button>
          )}
          {order.status === "in_progress" && (
            <Button
              variant="primary"
              onClick={() => handleStatusChange("done")}
              disabled={statusMutation.isPending}
            >
              Mark as Done
            </Button>
          )}
          {["draft", "confirmed"].includes(order.status) && (
            <Button
              variant="danger"
              onClick={() => handleStatusChange("cancelled")}
              disabled={statusMutation.isPending}
            >
              Cancel Order
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// Icon Components
function ArrowLeftIcon({ className }: { className?: string }) {
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
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
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

function PencilIcon({ className }: { className?: string }) {
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
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}
```

### Status Badge Component

```tsx
"use client";

import { Badge } from "@maiyuri/ui";
import type { BadgeProps } from "@maiyuri/ui";

type ProductionOrderStatus =
  | "draft"
  | "confirmed"
  | "in_progress"
  | "done"
  | "cancelled";

interface ProductionOrderStatusBadgeProps {
  status: ProductionOrderStatus;
}

const statusConfig: Record<
  ProductionOrderStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  draft: { label: "Draft", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  in_progress: { label: "In Progress", variant: "warning" },
  done: { label: "Done", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

export function ProductionOrderStatusBadge({
  status,
}: ProductionOrderStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "default" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

---

## Accessibility & Responsiveness

### Accessibility Features

1. **ARIA Labels:**
   - All interactive elements have proper `aria-label` attributes
   - Form inputs are associated with labels using `htmlFor` and `id`
   - Modal/panel has `role="dialog"` with `aria-modal="true"`

2. **Keyboard Navigation:**
   - Tab order follows logical flow
   - Escape key closes slide-out panel
   - Enter key submits forms

3. **Focus Management:**
   - Focus trap within modal/panel
   - Focus returns to trigger button on close
   - Visible focus indicators using `focus-visible:ring-2`

4. **Screen Reader Support:**
   - Semantic HTML (`<table>`, `<th>`, `<td>` for data tables)
   - Status badges have text content, not just colors
   - Loading states announced with `aria-live="polite"`

### Responsive Breakpoints

| Breakpoint | Width          | Layout Changes                                    |
| ---------- | -------------- | ------------------------------------------------- |
| Mobile     | < 640px        | Single column, full-width panel                   |
| Tablet     | 640px - 1024px | 2-column grid for products, panel max-width 600px |
| Desktop    | > 1024px       | 3-column grid for products, panel max-width 768px |

### Dark Mode

All components use design tokens from `globals.css`:

- Background: `bg-white dark:bg-slate-900`
- Text: `text-slate-900 dark:text-white`
- Borders: `border-slate-200 dark:border-slate-700`
- Cards: `bg-card` (auto-switches based on theme)

---

## Implementation Checklist

### Phase 1: Foundation (Day 1)

- [ ] Create type definitions for Production entities
- [ ] Set up API hooks (`useProduction.ts`)
- [ ] Create status badge component
- [ ] Implement basic list page layout

### Phase 2: List View (Day 2)

- [ ] Build ProductionOrdersList component
- [ ] Add filter controls
- [ ] Implement search functionality
- [ ] Add empty states and loading states

### Phase 3: Form Panel (Day 3-4)

- [ ] Build ProductionOrderPanel component
- [ ] Implement FinishedGoodSelector
- [ ] Implement ShiftAttendanceInput
- [ ] Implement RawMaterialConsumption
- [ ] Add form validation

### Phase 4: Detail View (Day 5)

- [ ] Build ProductionOrderDetail component
- [ ] Add status transition actions
- [ ] Implement Odoo sync UI

### Phase 5: Integration & Testing (Day 6-7)

- [ ] Connect to backend APIs
- [ ] Add error handling and toasts
- [ ] Test responsive layouts
- [ ] Test dark mode
- [ ] Accessibility audit
- [ ] Write unit tests

---

## Mock Data Examples

### Finished Good

```typescript
const mockFinishedGood: FinishedGood = {
  id: "fg-001",
  name: '6" Mud Interlock',
  category: "mud_interlock",
  bom_qty: 5000,
  uom: "pcs",
  bom_lines: [
    {
      product_id: "mat-001",
      product_name: "Cement",
      quantity: 500,
      uom: "kg",
    },
    {
      product_id: "mat-002",
      product_name: "Sand",
      quantity: 2000,
      uom: "kg",
    },
  ],
};
```

### Production Order

```typescript
const mockProductionOrder: ProductionOrder = {
  id: "mo-001",
  order_number: "MO-2026-0001",
  finished_good_id: "fg-001",
  finished_good_name: '6" Mud Interlock',
  planned_qty: 5000,
  actual_qty: 4850,
  uom: "pcs",
  scheduled_date: "2026-01-18",
  status: "in_progress",
  notes: "Quality check completed. All units passed inspection.",
  created_at: "2026-01-15T10:30:00Z",
  updated_at: "2026-01-18T14:20:00Z",
  odoo_synced_at: "2026-01-18T14:25:00Z",
  odoo_mo_id: 12345,
  shifts: [
    {
      id: "shift-001",
      date: "2026-01-18",
      start_time: "08:00",
      end_time: "16:00",
      employees: [
        { id: "emp-001", name: "Azjzul sekh" },
        { id: "emp-002", name: "Ferai Sekh" },
      ],
    },
  ],
  material_lines: [
    {
      material_id: "mat-001",
      material_name: "Cement",
      expected_qty: 500,
      actual_qty: 480,
      uom: "kg",
    },
    {
      material_id: "mat-002",
      material_name: "Sand",
      expected_qty: 2000,
      actual_qty: 2000,
      uom: "kg",
    },
  ],
};
```

---

## Design Notes

### Visual Hierarchy

1. **Emerald Accent:** Used for production-related primary actions to differentiate from the blue primary color used elsewhere
2. **Section Numbering:** Circle badges (1-5) guide users through the form flow
3. **Status Colors:** Consistent with existing design system (green=done, yellow=in-progress, red=cancelled)

### UX Considerations

1. **Auto-calculation:** Material requirements update automatically when quantity/good changes
2. **Progressive Disclosure:** Only show relevant sections (e.g., material consumption only appears after selecting a good)
3. **Inline Validation:** Real-time feedback for quantity inputs
4. **Shift Management:** Easy to add multiple shifts with employee selection
5. **Difference Highlighting:** Color-coded material variance makes deviations obvious

### Performance

1. **Optimistic Updates:** UI updates before server confirmation for better perceived performance
2. **Debounced Search:** 300ms debounce on search input to reduce API calls
3. **Virtualization:** Consider for long material lists (>50 items)
4. **Lazy Loading:** Load detail data only when panel opens

---

**End of Design Specification**
