export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  created,
  error,
  parseBody,
  parseQuery,
} from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import {
  getProductionOrders,
  createProductionOrder,
} from "@/lib/production-service";
import {
  createProductionOrderSchema,
  productionOrderFiltersSchema,
} from "@maiyuri/shared";
import type { ProductionOrder } from "@maiyuri/shared";

// GET /api/production/orders - List production orders with filters
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);

    // Parse filters from query params
    const filterResult = productionOrderFiltersSchema.safeParse({
      status: queryParams.status || undefined,
      finished_good_id: queryParams.finished_good_id || undefined,
      from_date: queryParams.from_date || undefined,
      to_date: queryParams.to_date || undefined,
      odoo_sync_status: queryParams.odoo_sync_status || undefined,
      search: queryParams.search || undefined,
    });

    const filters = filterResult.success ? filterResult.data : {};
    const orders = await getProductionOrders(filters);

    return success<ProductionOrder[]>(orders);
  } catch (err) {
    console.error("Error fetching production orders:", err);
    return error("Failed to fetch production orders", 500);
  }
}

// POST /api/production/orders - Create a new production order
export async function POST(request: NextRequest) {
  try {
    // Get the current user
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return error("Unauthorized", 401);
    }

    const parsed = await parseBody(request, createProductionOrderSchema);
    if (parsed.error) return parsed.error;

    const result = await createProductionOrder(parsed.data, user.id);

    if (!result.success) {
      return error(result.error ?? "Failed to create order", 500);
    }

    // Fetch the created order
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data: order } = await supabaseAdmin
      .from("production_orders")
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
      .eq("id", result.orderId)
      .single();

    return created<ProductionOrder>(order);
  } catch (err) {
    console.error("Error creating production order:", err);
    return error("Internal server error", 500);
  }
}
