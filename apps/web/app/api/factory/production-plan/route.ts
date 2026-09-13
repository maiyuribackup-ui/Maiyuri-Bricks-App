export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/factory/production-plan?from&to
export async function GET(request: NextRequest) {
  try {
    const { from, to } = parseQuery(request);
    let query = supabaseAdmin
      .from("factory_production_plan")
      .select("*, factory_products(code)")
      .order("plan_date", { ascending: true });
    if (from) query = query.gte("plan_date", from);
    if (to) query = query.lte("plan_date", to);
    const { data, error: dbError } = await query.limit(400);
    if (dbError) return error("Failed to load production plan", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory production-plan GET failed:", err);
    return error("Failed to load production plan", 500);
  }
}

const upsertSchema = z.object({
  plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  product_id: z.string().uuid(),
  planned_qty: z.number().int().min(0),
  plan_note: z.string().nullable().optional(),
});

// POST — one row per date+product; actuals are NEVER stored here, they come
// from the production log at read time.
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, upsertSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_production_plan")
      .upsert(parsed.data, { onConflict: "plan_date,product_id" })
      .select("*")
      .single();
    if (dbError) return error(`Failed to save plan row: ${dbError.message}`, 500);
    return success(data);
  } catch (err) {
    console.error("factory production-plan POST failed:", err);
    return error("Failed to save plan row", 500);
  }
}
