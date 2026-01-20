export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseQuery } from "@/lib/api-utils";
import { getDeliveries, pullDeliveriesFromOdoo } from "@/lib/delivery-service";
import type { DeliveryWithLines, DeliveryFilters } from "@maiyuri/shared";

// Query params schema (camelCase from API, transform to snake_case for service)
const deliveryFiltersSchema = z.object({
  status: z.string().optional(),
  driverId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// GET /api/deliveries - List deliveries with filters
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);
    const parsed = deliveryFiltersSchema.parse(queryParams);

    // Transform to snake_case for service layer
    const filters: DeliveryFilters = {
      status: parsed.status as DeliveryFilters["status"],
      driver_id: parsed.driverId,
      from_date: parsed.dateFrom,
      to_date: parsed.dateTo,
      search: parsed.search,
      sort_order: parsed.sortOrder,
      limit: parsed.limit,
      offset: parsed.offset,
    };

    const { data, error: dbError } = await getDeliveries(filters);

    if (dbError) {
      console.error("Error fetching deliveries:", dbError);
      return error("Failed to fetch deliveries", 500);
    }

    return success<DeliveryWithLines[]>(data ?? [], {
      total: data?.length ?? 0,
      page: Math.floor((parsed.offset ?? 0) / (parsed.limit ?? 50)) + 1,
      limit: parsed.limit ?? 50,
    });
  } catch (err) {
    console.error("Error in GET /api/deliveries:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/deliveries - Trigger sync from Odoo
export async function POST(request: NextRequest) {
  try {
    // Optional date filter in body
    let dateFrom: string | undefined;
    try {
      const body = await request.json();
      dateFrom = body.dateFrom;
    } catch {
      // No body or invalid JSON is fine
    }

    const result = await pullDeliveriesFromOdoo(dateFrom);

    if (!result.success) {
      return error(result.message, 500);
    }

    return success(result.data, {
      total: (result.data as { synced?: number })?.synced ?? 0,
    });
  } catch (err) {
    console.error("Error in POST /api/deliveries:", err);
    return error("Internal server error", 500);
  }
}
