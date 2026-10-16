export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, created, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYMENT_STATUSES } from "@/lib/factory";

// GET /api/factory/orders — reads factory_orders_v (delivered/balance/fulfilment
// derived from dispatches). ?status=open → not Complete, not Cancelled, oldest first.
export async function GET(request: NextRequest) {
  try {
    const { status } = parseQuery(request);
    let query = supabaseAdmin
      .from("factory_orders_v")
      .select("*")
      .order("order_date", { ascending: true });
    if (status === "open") {
      query = query.neq("fulfilment", "Complete").neq("payment_status", "Cancelled");
    }
    const { data, error: dbError } = await query;
    if (dbError) return error("Failed to load orders", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory orders GET failed:", err);
    return error("Failed to load orders", 500);
  }
}

const baseSchema = z.object({
  customer_id: z.string().uuid(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  product_id: z.string().uuid(),
  qty_ordered: z.number().int().positive(),
  payment_status: z.enum(PAYMENT_STATUSES).default("Clear"),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_orders")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) return error(`Failed to create order: ${dbError.message}`, 500);
    return created(data);
  } catch (err) {
    console.error("factory orders POST failed:", err);
    return error("Failed to create order", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema.partial().extend({ id: z.string().uuid() }));
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_orders")
      .update(fields)
      .eq("id", id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update order", 500);
    return success(data);
  } catch (err) {
    console.error("factory orders PATCH failed:", err);
    return error("Failed to update order", 500);
  }
}
