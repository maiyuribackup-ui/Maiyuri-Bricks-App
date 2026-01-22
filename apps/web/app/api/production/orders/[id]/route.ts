export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductionOrder } from "@/lib/production-service";
import { updateProductionOrderSchema } from "@maiyuri/shared";
import type { ProductionOrder } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/production/orders/[id] - Get a single production order
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Order ID is required", 400);
    }

    const order = await getProductionOrder(id);

    if (!order) {
      return notFound("Production order not found");
    }

    return success<ProductionOrder>(order);
  } catch (err) {
    console.error("Error fetching production order:", err);
    return error("Failed to fetch production order", 500);
  }
}

// PUT /api/production/orders/[id] - Update a production order
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Order ID is required", 400);
    }

    const parsed = await parseBody(request, updateProductionOrderSchema);
    if (parsed.error) return parsed.error;

    const { data: order, error: dbError } = await supabaseAdmin
      .from("production_orders")
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        finished_good:finished_goods(*),
        consumption_lines:production_consumption_lines(
          *,
          raw_material:raw_materials(*)
        )
      `,
      )
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to update production order", 500);
    }

    return success<ProductionOrder>(order);
  } catch (err) {
    console.error("Error updating production order:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/production/orders/[id] - Delete a production order (founders only)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Order ID is required", 400);
    }

    // Check if order exists and is in draft status
    const { data: existingOrder } = await supabaseAdmin
      .from("production_orders")
      .select("id, status, odoo_production_id")
      .eq("id", id)
      .single();

    if (!existingOrder) {
      return notFound("Production order not found");
    }

    if (existingOrder.status !== "draft") {
      return error("Can only delete orders in draft status", 400);
    }

    if (existingOrder.odoo_production_id) {
      return error("Cannot delete order that has been synced to Odoo", 400);
    }

    // Delete related records first (cascade should handle this, but being explicit)
    await supabaseAdmin
      .from("production_consumption_lines")
      .delete()
      .eq("production_order_id", id);

    await supabaseAdmin
      .from("production_shifts")
      .delete()
      .eq("production_order_id", id);

    // Delete the order
    const { error: dbError } = await supabaseAdmin
      .from("production_orders")
      .delete()
      .eq("id", id);

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to delete production order", 500);
    }

    return success({ deleted: true, id });
  } catch (err) {
    console.error("Error deleting production order:", err);
    return error("Internal server error", 500);
  }
}
