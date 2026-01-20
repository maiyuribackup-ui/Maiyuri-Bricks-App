"use client";

import Link from "next/link";
import { Card } from "@maiyuri/ui";
import { DeliveryStatusBadge } from "./DeliveryStatusBadge";
import type { DeliveryWithLines } from "@maiyuri/shared";
import {
  MapPin,
  Phone,
  Calendar,
  Package,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface DeliveryCardProps {
  delivery: DeliveryWithLines;
}

export function DeliveryCard({ delivery }: DeliveryCardProps) {
  const scheduledDate = new Date(delivery.scheduled_date);
  const isToday = new Date().toDateString() === scheduledDate.toDateString();
  const isPast = scheduledDate < new Date() && delivery.status !== "delivered";
  const isUrgent = delivery.priority === 1;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: Date) => {
    if (isToday) return `Today, ${formatTime(date)}`;
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Link href={`/deliveries/${delivery.id}`}>
      <Card
        className={`hover:shadow-md transition-shadow cursor-pointer ${
          isPast ? "border-l-4 border-l-red-500" : ""
        } ${isUrgent ? "border-l-4 border-l-orange-500" : ""}`}
      >
        <div className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{delivery.name}</span>
              {isUrgent && (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <DeliveryStatusBadge status={delivery.status} size="sm" />
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">
                {delivery.customer_name}
              </span>
            </div>

            {delivery.customer_address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <span className="line-clamp-2">
                  {delivery.customer_address}
                  {delivery.customer_city ? `, ${delivery.customer_city}` : ""}
                </span>
              </div>
            )}

            {delivery.customer_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{delivery.customer_phone}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className={isPast ? "text-red-600 font-medium" : ""}>
                {formatDate(scheduledDate)}
              </span>
            </div>

            {delivery.total_quantity && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>
                  {delivery.delivery_lines?.length ?? 0} items (
                  {delivery.total_quantity} units)
                </span>
              </div>
            )}
          </div>

          {delivery.origin && (
            <div className="mt-3 pt-3 border-t text-xs text-gray-500">
              Source: {delivery.origin}
              {delivery.odoo_sale_name && ` (${delivery.odoo_sale_name})`}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
