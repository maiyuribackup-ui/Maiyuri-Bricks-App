export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  created,
  error,
  parseBody,
  parseQuery,
} from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createShift, getShifts } from "@/lib/production-service";
import { createShiftSchema } from "@maiyuri/shared";
import type { ProductionShift } from "@maiyuri/shared";

// GET /api/production/shifts - Get shifts for an order
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);
    const orderId = queryParams.order_id;

    if (!orderId) {
      return error("Order ID is required", 400);
    }

    const shifts = await getShifts(orderId);
    return success<ProductionShift[]>(shifts);
  } catch (err) {
    console.error("Error fetching shifts:", err);
    return error("Failed to fetch shifts", 500);
  }
}

// POST /api/production/shifts - Create a new shift
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, createShiftSchema);
    if (parsed.error) return parsed.error;

    const result = await createShift(
      parsed.data.production_order_id,
      parsed.data.shift_date,
      parsed.data.start_time,
      parsed.data.employee_ids,
      parsed.data.notes ?? undefined,
    );

    if (!result.success) {
      return error(result.error ?? "Failed to create shift", 500);
    }

    // Fetch the created shift with attendance
    const { data: shift } = await supabaseAdmin
      .from("production_shifts")
      .select(
        `
        *,
        attendance:production_attendance(
          *,
          employee:employees(*)
        )
      `,
      )
      .eq("id", result.shiftId)
      .single();

    return created<ProductionShift>(shift);
  } catch (err) {
    console.error("Error creating shift:", err);
    return error("Internal server error", 500);
  }
}
