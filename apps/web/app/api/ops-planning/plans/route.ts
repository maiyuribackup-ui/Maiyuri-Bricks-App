export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";
import { activatePlan, type DraftPlan } from "@/lib/ops-planning/planning-service";

const itemSchema = z.object({
  item_type: z.enum(["production", "delivery"]),
  item_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  finished_good_id: z.string().uuid().nullable(),
  product_name: z.string(),
  quantity: z.number().nonnegative(),
  sale_order_ref: z.string(),
  customer_name: z.string(),
});

const draftSchema = z.object({
  name: z.string().min(1),
  horizon_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horizon_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  constraint_text: z.string().nullable(),
  selected_order_refs: z.array(z.string()),
  ai_rationale: z.string(),
  ai_used: z.boolean(),
  ai_priorities: z.unknown(),
  items: z.array(itemSchema),
  promises: z.array(z.unknown()),
  warnings: z.array(z.unknown()),
  totals: z.object({
    production_units: z.number(),
    production_runs: z.number(),
    deliveries: z.number(),
  }),
});

// POST /api/ops-planning/plans — persist + activate a draft plan
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    const parsed = await parseBody(request, draftSchema);
    if (parsed.error) return parsed.error;

    const result = await activatePlan(parsed.data as DraftPlan, user?.id ?? null);
    return success(result);
  } catch (err) {
    console.error("plan activation failed:", err);
    return error(
      err instanceof Error ? err.message : "Plan activation failed",
      500,
    );
  }
}
