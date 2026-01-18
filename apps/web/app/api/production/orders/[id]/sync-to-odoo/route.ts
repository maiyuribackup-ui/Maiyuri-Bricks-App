export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase";
import {
  createManufacturingOrderInOdoo,
  bulkSyncAttendanceToOdoo,
  getProductionOrder,
} from "@/lib/production-service";
import { syncToOdooSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/production/orders/[id]/sync-to-odoo - Create MO in Odoo
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Order ID is required", 400);
    }

    // Parse options
    const parsed = await parseBody(request, syncToOdooSchema).catch(() => ({
      data: { include_attendance: true },
      error: null,
    }));
    const options = parsed.data ?? { include_attendance: true };

    // Check if order exists
    const order = await getProductionOrder(id);
    if (!order) {
      return notFound("Production order not found");
    }

    // Check if already synced
    if (order.odoo_production_id) {
      return error("Order already synced to Odoo", 400);
    }

    // Create MO in Odoo
    const moResult = await createManufacturingOrderInOdoo(id);

    if (!moResult.success) {
      return error(moResult.error ?? moResult.message, 500);
    }

    // Sync attendance if requested
    const attendanceResults: Array<{
      shiftId: string;
      synced: number;
      failed: number;
    }> = [];

    if (options.include_attendance && order.shifts) {
      for (const shift of order.shifts as Array<{ id: string }>) {
        const attendanceResult = await bulkSyncAttendanceToOdoo(shift.id);
        if (attendanceResult.data) {
          attendanceResults.push({
            shiftId: shift.id,
            synced: attendanceResult.data.synced as number,
            failed: attendanceResult.data.failed as number,
          });
        }
      }
    }

    // Update order status to confirmed
    await supabaseAdmin
      .from("production_orders")
      .update({ status: "confirmed" })
      .eq("id", id);

    return success({
      odooProductionId: moResult.data?.odooProductionId,
      attendance: attendanceResults,
      message: moResult.message,
    });
  } catch (err) {
    console.error("Error syncing to Odoo:", err);
    return error("Failed to sync to Odoo", 500);
  }
}
