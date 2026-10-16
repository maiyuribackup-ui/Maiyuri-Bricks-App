"use client";

import { Badge } from "@maiyuri/ui";

type ProductionOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "confirmed"
  | "in_progress"
  | "done"
  | "cancelled"
  | "completed";

interface ProductionOrderStatusBadgeProps {
  status: ProductionOrderStatus | string;
}

const statusConfig: Record<
  ProductionOrderStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  draft: { label: "Draft", variant: "default" },
  pending_approval: { label: "Pending Approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  confirmed: { label: "Confirmed", variant: "default" },
  in_progress: { label: "In Progress", variant: "warning" },
  done: { label: "Done", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
  completed: { label: "Completed", variant: "success" },
};

export function ProductionOrderStatusBadge({
  status,
}: ProductionOrderStatusBadgeProps) {
  const config = statusConfig[status as ProductionOrderStatus] ?? {
    label: status,
    variant: "default" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
