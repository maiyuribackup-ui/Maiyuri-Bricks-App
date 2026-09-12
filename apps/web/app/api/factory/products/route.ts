export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/factory/products — the 4 SKUs with opening stock state
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_products")
      .select("*")
      .order("code");
    if (dbError) return error("Failed to load products", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory products GET failed:", err);
    return error("Failed to load products", 500);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  // Opening stock entry IS the stock-take: recording it sets opening_counted_at.
  opening_stock: z.number().int().min(0).optional(),
  opening_counted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().nullable().optional(),
});

// PATCH /api/factory/products — opening stock + notes only; code is immutable.
export async function PATCH(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;

    const update: Record<string, unknown> = { ...fields };
    if (fields.opening_stock !== undefined && fields.opening_counted_at === undefined) {
      update.opening_counted_at = new Date().toISOString().slice(0, 10);
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("factory_products")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update product", 500);
    return success(data);
  } catch (err) {
    console.error("factory products PATCH failed:", err);
    return error("Failed to update product", 500);
  }
}
