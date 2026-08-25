export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, created, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { factoryWeekEnd, factoryWeekStart, WORK_TYPES } from "@/lib/factory";

// GET /api/factory/labour?week=YYYY-MM-DD or ?from&to
export async function GET(request: NextRequest) {
  try {
    const { week, from, to } = parseQuery(request);
    let query = supabaseAdmin
      .from("factory_labour")
      .select("*")
      .order("work_date", { ascending: false });
    if (week) {
      query = query
        .gte("work_date", factoryWeekStart(week))
        .lte("work_date", factoryWeekEnd(week));
    } else {
      if (from) query = query.gte("work_date", from);
      if (to) query = query.lte("work_date", to);
    }
    const { data, error: dbError } = await query.limit(500);
    if (dbError) return error("Failed to load labour entries", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory labour GET failed:", err);
    return error("Failed to load labour entries", 500);
  }
}

const baseSchema = z
  .object({
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    worker: z.string().min(1).max(120),
    work_type: z.enum(WORK_TYPES),
    qty: z.number(),
    rate: z.number(),
    notes: z.string().nullable().optional(),
  })
  .refine((l) => l.work_type !== "Advance" || (l.qty === 1 && l.rate < 0), {
    message: "Advances are qty 1 with a negative rate (e.g. 1 × -3500)",
  });

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_labour")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) return error(`Failed to create labour entry: ${dbError.message}`, 500);
    return created(data);
  } catch (err) {
    console.error("factory labour POST failed:", err);
    return error("Failed to create labour entry", 500);
  }
}
