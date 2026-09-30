export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, created, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { VEHICLES } from "@/lib/factory";

// GET /api/factory/trips — vehicle log; total_km / km_per_litre derived client-side
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_trips")
      .select("*")
      .order("trip_date", { ascending: false })
      .limit(200);
    if (dbError) return error("Failed to load trips", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory trips GET failed:", err);
    return error("Failed to load trips", 500);
  }
}

const baseSchema = z
  .object({
    trip_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vehicle: z.enum(VEHICLES),
    start_km: z.number().min(0).nullable().optional(),
    end_km: z.number().min(0).nullable().optional(),
    diesel_litres: z.number().min(0).nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (t) => t.start_km == null || t.end_km == null || t.end_km >= t.start_km,
    { message: "End KM must be at or after start KM" },
  );

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_trips")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) return error(`Failed to create trip: ${dbError.message}`, 500);
    return created(data);
  } catch (err) {
    console.error("factory trips POST failed:", err);
    return error("Failed to create trip", 500);
  }
}
