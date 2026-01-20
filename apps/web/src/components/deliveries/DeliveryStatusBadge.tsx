"use client";

import { Badge } from "@maiyuri/ui";
import type { DeliveryStatus } from "@maiyuri/shared";

interface DeliveryStatusBadgeProps {
  status: DeliveryStatus | string;
  size?: "sm" | "md";
}

const statusConfig: Record<
  DeliveryStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  draft: { label: "Draft", variant: "default" },
  waiting: { label: "Waiting", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  assigned: { label: "Assigned", variant: "warning" },
  in_transit: { label: "In Transit", variant: "warning" },
  delivered: { label: "Delivered", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

export function DeliveryStatusBadge({
  status,
  size = "md",
}: DeliveryStatusBadgeProps) {
  const config = statusConfig[status as DeliveryStatus] ?? {
    label: status,
    variant: "default" as const,
  };

  return (
    <Badge
      variant={config.variant}
      className={size === "sm" ? "text-xs px-2 py-0.5" : ""}
    >
      {config.label}
    </Badge>
  );
}
