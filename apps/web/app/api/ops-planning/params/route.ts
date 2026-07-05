export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/ops-planning/params — all products with their planning knobs
export async function GET() {
  try {
    const { data: goods, error: dbError } = await supabaseAdmin
      .from("finished_goods")
      .select("id, name, stock_qty, product_planning_params(daily_capacity_units, curing_days, min_batch)")
      .eq("is_active", true)
      .order("name");
    if (dbError) return error("Failed to load planning params", 500);

    const rows = (goods ?? []).map((g) => {
      const p = Array.isArray(g.product_planning_params)
        ? g.product_planning_params[0]
        : g.product_planning_params;
      return {
        finished_good_id: g.id,
        product_name: g.name,
        stock_qty: g.stock_qty ?? null,
        daily_capacity_units: p ? Number(p.daily_capacity_units) : null,
        curing_days: p ? Number(p.curing_days) : null,
        min_batch: p ? Number(p.min_batch) : null,
      };
    });
    return success(rows);
  } catch (err) {
    console.error("params GET failed:", err);
    return error("Failed to load planning params", 500);
  }
}

const putSchema = z.object({
  finished_good_id: z.string().uuid(),
  daily_capacity_units: z.number().nonnegative(),
  curing_days: z.number().int().min(0).max(60).default(7),
  min_batch: z.number().nonnegative().default(0),
});

// PUT /api/ops-planning/params — upsert one product's planning knobs
export async function PUT(request: NextRequest) {
  try {
    const parsed = await parseBody(request, putSchema);
    if (parsed.error) return parsed.error;

    const { error: dbError } = await supabaseAdmin
      .from("product_planning_params")
      .upsert(
        {
          finished_good_id: parsed.data.finished_good_id,
          daily_capacity_units: parsed.data.daily_capacity_units,
          curing_days: parsed.data.curing_days,
          min_batch: parsed.data.min_batch,
          is_active: true,
        },
        { onConflict: "finished_good_id" },
      );
    if (dbError) return error(`Failed to save: ${dbError.message}`, 500);

    return success({ saved: true });
  } catch (err) {
    console.error("params PUT failed:", err);
    return error("Failed to save planning params", 500);
  }
}
