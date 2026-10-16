export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DATA_FLAGS_PRODUCTION, DOWNTIME_REASONS } from "@/lib/factory";

// GET /api/factory/production-log?from&to&product_id
export async function GET(request: NextRequest) {
  try {
    const { from, to, product_id } = parseQuery(request);
    let query = supabaseAdmin
      .from("factory_production_log")
      .select("*, factory_products(code)")
      .order("log_date", { ascending: false });
    if (from) query = query.gte("log_date", from);
    if (to) query = query.lte("log_date", to);
    if (product_id) query = query.eq("product_id", product_id);
    const { data, error: dbError } = await query.limit(400);
    if (dbError) return error("Failed to load production log", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory production-log GET failed:", err);
    return error("Failed to load production log", 500);
  }
}

const upsertSchema = z.object({
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  product_id: z.string().uuid(),
  qty_produced: z.number().int().min(0),
  cement_bags: z.number().min(0).nullable().optional(),
  downtime_reason: z.enum(DOWNTIME_REASONS).default("None"),
  remarks: z.string().nullable().optional(),
  data_flag: z.enum(DATA_FLAGS_PRODUCTION).default("OK"),
});

// POST /api/factory/production-log — one row per date+product; re-submitting
// the same date+product EDITS it (upsert), so mobile entry can't duplicate.
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, upsertSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_production_log")
      .upsert(parsed.data, { onConflict: "log_date,product_id" })
      .select("*")
      .single();
    if (dbError) return error(`Failed to save production entry: ${dbError.message}`, 500);
    return success(data);
  } catch (err) {
    console.error("factory production-log POST failed:", err);
    return error("Failed to save production entry", 500);
  }
}
