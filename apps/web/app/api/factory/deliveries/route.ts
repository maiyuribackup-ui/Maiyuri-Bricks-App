export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, created, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DATA_FLAGS_DELIVERY,
  DELIVERY_STATUSES,
  factoryWeekEnd,
  factoryWeekStart,
} from "@/lib/factory";

// GET /api/factory/deliveries?week=YYYY-MM-DD (any date in the Sat–Fri week)
// or ?from&to. Joined with customer + product for composed row labels.
export async function GET(request: NextRequest) {
  try {
    const { week, from, to } = parseQuery(request);
    let query = supabaseAdmin
      .from("factory_deliveries")
      .select("*, factory_customers(name, credit_hold), factory_products(code)")
      .order("delivery_date", { ascending: true });
    if (week) {
      query = query
        .gte("delivery_date", factoryWeekStart(week))
        .lte("delivery_date", factoryWeekEnd(week));
    } else {
      if (from) query = query.gte("delivery_date", from);
      if (to) query = query.lte("delivery_date", to);
    }
    const { data, error: dbError } = await query.limit(500);
    if (dbError) return error("Failed to load deliveries", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory deliveries GET failed:", err);
    return error("Failed to load deliveries", 500);
  }
}

const baseSchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customer_id: z.string().uuid(),
  product_id: z.string().uuid(),
  qty: z.number().int().min(0), // 0 = qty still to confirm
  status: z.enum(DELIVERY_STATUSES).default("Planned"),
  order_id: z.string().uuid().nullable().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  data_flag: z.enum(DATA_FLAGS_DELIVERY).default("OK"),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_deliveries")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) return error(`Failed to create delivery: ${dbError.message}`, 500);
    return created(data);
  } catch (err) {
    console.error("factory deliveries POST failed:", err);
    return error("Failed to create delivery", 500);
  }
}
