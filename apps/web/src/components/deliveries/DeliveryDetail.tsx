"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Spinner, Badge } from "@maiyuri/ui";
import {
  useDelivery,
  useUpdateDeliveryStatus,
  useCompleteDelivery,
} from "@/hooks/useDeliveries";
import { DeliveryStatusBadge } from "./DeliveryStatusBadge";
import { ProofOfDelivery, PODData } from "./ProofOfDelivery";
import type { DeliveryStatus, DeliveryLine } from "@maiyuri/shared";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Calendar,
  Package,
  Truck,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Navigation,
  Clipboard,
} from "lucide-react";

interface DeliveryDetailProps {
  id: string;
}

export function DeliveryDetail({ id }: DeliveryDetailProps) {
  const router = useRouter();
  const { data: deliveryData, isLoading, error } = useDelivery(id);
  const updateStatusMutation = useUpdateDeliveryStatus();
  const completeMutation = useCompleteDelivery();

  const [notes, setNotes] = useState("");
  const [showPODModal, setShowPODModal] = useState(false);

  const delivery = deliveryData?.data;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <Card className="p-12 text-center">
        <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
        <h3 className="text-sm font-medium text-slate-900 dark:text-white">
          Delivery not found
        </h3>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/deliveries")}
        >
          Back to Deliveries
        </Button>
      </Card>
    );
  }

  const scheduledDate = new Date(delivery.scheduled_date);
  const isUrgent = delivery.priority === 1;
  const isPast = scheduledDate < new Date() && delivery.status !== "delivered";
  const canStartDelivery = ["confirmed", "assigned"].includes(delivery.status);
  const canComplete = ["assigned", "in_transit"].includes(delivery.status);
  const isComplete = delivery.status === "delivered";

  const handleStatusUpdate = async (status: DeliveryStatus) => {
    try {
      await updateStatusMutation.mutateAsync({
        id,
        status,
        notes: notes || undefined,
      });
      setNotes("");
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Handle POD completion with signature and photos
  const handlePODComplete = useCallback(
    async (podData: PODData) => {
      try {
        // Upload signature if present (convert data URL to Supabase storage URL)
        let signatureData: string | undefined;
        if (podData.signatureDataUrl) {
          // Pass the base64 data URL directly - the API will handle storage
          signatureData = podData.signatureDataUrl;
        }

        // Upload photos and get URLs
        const photoUrls: string[] = [];
        for (const photo of podData.photos) {
          // For now, create object URLs - in production these would upload to Supabase
          // The backend will handle proper storage
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(photo.file);
          });
          photoUrls.push(dataUrl);
        }

        await completeMutation.mutateAsync({
          id,
          signatureData,
          photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
          recipientName: podData.recipientName,
          notes: podData.notes,
        });

        setShowPODModal(false);
      } catch (err) {
        console.error("Failed to complete delivery:", err);
        throw err; // Re-throw to show error in POD modal
      }
    },
    [id, completeMutation],
  );

  const openInMaps = () => {
    if (delivery.delivery_latitude && delivery.delivery_longitude) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${delivery.delivery_latitude},${delivery.delivery_longitude}`,
        "_blank",
      );
    } else if (delivery.customer_address) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          delivery.customer_address +
            (delivery.customer_city ? ", " + delivery.customer_city : ""),
        )}`,
        "_blank",
      );
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/deliveries")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {delivery.name}
            </h1>
            <DeliveryStatusBadge status={delivery.status} />
            {isUrgent && (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Urgent
              </Badge>
            )}
          </div>
          {delivery.origin && (
            <p className="mt-1 text-sm text-slate-500">
              Source: {delivery.origin}
              {delivery.odoo_sale_name && ` (${delivery.odoo_sale_name})`}
            </p>
          )}
        </div>
      </div>

      {/* Status Banner for overdue */}
      {isPast && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="font-medium text-red-900 dark:text-red-200">
                Delivery Overdue
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                Scheduled for {formatDate(scheduledDate)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info Card */}
          <Card className="p-0">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-slate-400" />
                Customer Details
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium">{delivery.customer_name}</p>
                </div>
              </div>

              {delivery.customer_address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div className="flex-1">
                    <p>
                      {delivery.customer_address}
                      {delivery.customer_city && `, ${delivery.customer_city}`}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-blue-600"
                      onClick={openInMaps}
                    >
                      <Navigation className="mr-1 h-4 w-4" />
                      Open in Maps
                    </Button>
                  </div>
                </div>
              )}

              {delivery.customer_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-slate-400" />
                  <a
                    href={`tel:${delivery.customer_phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {delivery.customer_phone}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-slate-400" />
                <div>
                  <p className={isPast ? "text-red-600 font-medium" : ""}>
                    {formatDate(scheduledDate)}
                  </p>
                  {delivery.date_done && (
                    <p className="text-sm text-green-600">
                      Delivered: {formatDate(new Date(delivery.date_done))}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Products Card */}
          <Card className="p-0">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clipboard className="h-5 w-5 text-slate-400" />
                Products ({delivery.delivery_lines?.length ?? 0})
              </h2>
            </div>
            <div className="p-4">
              {delivery.delivery_lines && delivery.delivery_lines.length > 0 ? (
                <div className="divide-y">
                  {delivery.delivery_lines.map((line: DeliveryLine) => (
                    <div key={line.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{line.product_name}</p>
                          {line.product_code && (
                            <p className="text-sm text-slate-500">
                              Code: {line.product_code}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {line.quantity_ordered?.toLocaleString() ?? 0}
                            {line.uom_name && ` ${line.uom_name}`}
                          </p>
                          {line.quantity_delivered !== null &&
                            line.quantity_delivered !== undefined && (
                              <p className="text-sm text-green-600">
                                Delivered:{" "}
                                {line.quantity_delivered?.toLocaleString()}
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No products listed</p>
              )}

              {/* Totals */}
              {delivery.total_quantity && (
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="font-medium">Total Quantity:</span>
                  <span className="font-bold text-lg">
                    {delivery.total_quantity.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Proof of Delivery (if completed) */}
          {isComplete &&
            (delivery.signature_url ||
              delivery.photo_urls?.length ||
              delivery.recipient_name) && (
              <Card className="p-0">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Proof of Delivery
                  </h2>
                </div>
                <div className="p-4 space-y-4">
                  {delivery.recipient_name && (
                    <div>
                      <p className="text-sm text-slate-500">Received by</p>
                      <p className="font-medium">{delivery.recipient_name}</p>
                    </div>
                  )}
                  {delivery.signature_captured_at && (
                    <div>
                      <p className="text-sm text-slate-500">Signed at</p>
                      <p>
                        {formatDate(new Date(delivery.signature_captured_at))}
                      </p>
                    </div>
                  )}
                  {delivery.delivery_notes && (
                    <div>
                      <p className="text-sm text-slate-500">Notes</p>
                      <p>{delivery.delivery_notes}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
        </div>

        {/* Actions Sidebar */}
        <div className="space-y-6">
          {/* Actions Card */}
          <Card className="p-0">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Truck className="h-5 w-5 text-slate-400" />
                Actions
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {canStartDelivery && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => handleStatusUpdate("in_transit")}
                  disabled={updateStatusMutation.isPending}
                >
                  {updateStatusMutation.isPending ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <Truck className="mr-2 h-4 w-4" />
                  )}
                  Start Delivery
                </Button>
              )}

              {canComplete && (
                <Button
                  variant="primary"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => setShowPODModal(true)}
                  disabled={completeMutation.isPending}
                >
                  {completeMutation.isPending ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Mark Complete
                </Button>
              )}

              {!isComplete && delivery.status !== "cancelled" && (
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => handleStatusUpdate("cancelled")}
                  disabled={updateStatusMutation.isPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Delivery
                </Button>
              )}

              {/* Notes input */}
              {!isComplete && (
                <div className="pt-4 border-t">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Add Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    rows={3}
                    placeholder="Optional delivery notes..."
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Sync Status Card */}
          <Card className="p-0">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-500">
                Sync Status
              </h2>
            </div>
            <div className="p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Odoo Status:</span>
                  <Badge
                    variant={
                      delivery.odoo_sync_status === "synced"
                        ? "success"
                        : delivery.odoo_sync_status === "error"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {delivery.odoo_sync_status}
                  </Badge>
                </div>
                {delivery.odoo_synced_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last Synced:</span>
                    <span>
                      {new Date(delivery.odoo_synced_at).toLocaleDateString(
                        "en-IN",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Odoo Ref:</span>
                  <span className="font-mono text-xs">
                    #{delivery.odoo_picking_id}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Proof of Delivery Modal */}
      {showPODModal && (
        <ProofOfDelivery
          deliveryId={id}
          deliveryName={delivery.name}
          onComplete={handlePODComplete}
          onCancel={() => setShowPODModal(false)}
          isSubmitting={completeMutation.isPending}
        />
      )}
    </div>
  );
}
