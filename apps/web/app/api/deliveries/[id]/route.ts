export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import {
  getDeliveryById,
  updateDeliveryStatus,
  assignDriver,
} from "@/lib/delivery-service";
import type { DeliveryWithLines, DeliveryStatus } from "@maiyuri/shared";

// Update status schema
const updateStatusSchema = z.object({
  status: z.enum([
    "draft",
    "waiting",
    "confirmed",
    "assigned",
    "in_transit",
    "delivered",
    "cancelled",
  ]),
  notes: z.string().optional(),
});

// Assign driver schema
const assignDriverSchema = z.object({
  driverId: z.string().uuid(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/deliveries/[id] - Get single delivery with lines
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data, error: dbError } = await getDeliveryById(id);

    if (dbError) {
      console.error("Error fetching delivery:", dbError);
      return error("Failed to fetch delivery", 500);
    }

    if (!data) {
      return notFound("Delivery not found");
    }

    return success<DeliveryWithLines>(data);
  } catch (err) {
    console.error("Error in GET /api/deliveries/[id]:", err);
    return error("Internal server error", 500);
  }
}

// PATCH /api/deliveries/[id] - Update status or assign driver
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Determine what we're updating
    if ("driverId" in body) {
      // Assign driver
      const parsed = assignDriverSchema.safeParse(body);
      if (!parsed.success) {
        return error("Invalid driver ID", 400);
      }

      const result = await assignDriver(id, {
        driver_id: parsed.data.driverId,
      });

      if (!result.success) {
        return error(result.message, 500);
      }

      return success(result.data);
    }

    if ("status" in body) {
      // Update status
      const parsed = updateStatusSchema.safeParse(body);
      if (!parsed.success) {
        return error("Invalid status", 400);
      }

      const result = await updateDeliveryStatus(id, {
        status: parsed.data.status as DeliveryStatus,
        notes: parsed.data.notes,
      });

      if (!result.success) {
        return error(result.message, 500);
      }

      // Return warning if Odoo sync failed but local update succeeded
      if (result.error) {
        return success(result.data, { total: 0 });
      }

      return success(result.data);
    }

    return error("No valid update fields provided", 400);
  } catch (err) {
    console.error("Error in PATCH /api/deliveries/[id]:", err);
    return error("Internal server error", 500);
  }
}
