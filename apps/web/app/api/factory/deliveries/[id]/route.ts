export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import {
  requireProductionRole,
  PRODUCTION_DELETE_ROLES,
} from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DATA_FLAGS_DELIVERY, DELIVERY_STATUSES } from "@/lib/factory";

const patchSchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  qty: z.number().int().min(0).optional(),
  status: z.enum(DELIVERY_STATUSES).optional(),
  order_id: z.string().uuid().nullable().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  data_flag: z.enum(DATA_FLAGS_DELIVERY).optional(),
  notes: z.string().nullable().optional(),
});

// PATCH /api/factory/deliveries/:id — the daily workflow: Planned → Delivered
// (or Postponed). Stock and order fulfilment recompute automatically.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_deliveries")
      .update(parsed.data)
      .eq("id", params.id)
      .select("*, factory_customers(name, credit_hold), factory_products(code)")
      .single();
    if (dbError || !data) return error("Failed to update delivery", 500);
    return success(data);
  } catch (err) {
    console.error("factory deliveries PATCH failed:", err);
    return error("Failed to update delivery", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { error: dbError } = await supabaseAdmin
      .from("factory_deliveries")
      .delete()
      .eq("id", params.id);
    if (dbError) return error("Failed to delete delivery", 500);
    return success({ deleted: true });
  } catch (err) {
    console.error("factory deliveries DELETE failed:", err);
    return error("Failed to delete delivery", 500);
  }
}
