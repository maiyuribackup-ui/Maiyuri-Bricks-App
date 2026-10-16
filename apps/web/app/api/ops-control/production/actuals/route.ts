export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { upsertOcProductionActualSchema } from "@maiyuri/shared";

/**
 * POST — save a DRAFT actual for a shift+product, creating or updating it.
 *
 * A draft may be incomplete and internally unbalanced in the ways that matter
 * to planning: accepted 1,200 with only 1,000 assigned to allocations is a
 * legal draft, because Rajesh is still entering. What a draft may NOT be is
 * physically impossible — accepted + rejected > gross is refused here and by
 * the database, since it describes bricks that never existed (PRD §27).
 *
 * Saving a draft has no side effects: no stock moves, nothing is reserved,
 * no coverage changes. Only POST does that.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, upsertOcProductionActualSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: existing } = await supabaseAdmin
      .from("oc_production_actuals")
      .select("id, status, lock_version")
      .eq("shift_id", input.shift_id)
      .eq("finished_good_id", input.finished_good_id)
      .maybeSingle();

    const row = existing as
      | { id: string; status: string; lock_version: number }
      | null;

    if (row) {
      if (row.status !== "draft") {
        return error(
          `This output is already ${row.status} — record an adjustment instead of editing it`,
          409,
        );
      }
      const expected = input.lock_version ?? row.lock_version;
      const { data, error: dbError } = await supabaseAdmin
        .from("oc_production_actuals")
        .update({
          gross_qty: input.gross_qty,
          accepted_qty: input.accepted_qty,
          rejected_qty: input.rejected_qty,
          deviation_reason_id: input.deviation_reason_id ?? null,
          deviation_comment: input.deviation_comment ?? null,
          lock_version: expected + 1,
        })
        .eq("id", row.id)
        .eq("lock_version", expected)
        .select("*")
        .maybeSingle();
      if (dbError) return error(`Failed to save output: ${dbError.message}`, 400);
      if (!data) {
        return error("This entry changed since you loaded it — reload and try again", 409);
      }
      return success(data);
    }

    // First save for this shift+product: snapshot what the plan said now, so
    // a later plan edit cannot rewrite what the shortfall looked like today.
    const { data: planLine } = await supabaseAdmin
      .from("oc_production_plan_lines")
      .select("planned_qty")
      .eq("shift_id", input.shift_id)
      .eq("finished_good_id", input.finished_good_id)
      .maybeSingle();

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_actuals")
      .insert({
        shift_id: input.shift_id,
        finished_good_id: input.finished_good_id,
        planned_qty_snapshot: (planLine as { planned_qty: number } | null)?.planned_qty ?? null,
        gross_qty: input.gross_qty,
        accepted_qty: input.accepted_qty,
        rejected_qty: input.rejected_qty,
        deviation_reason_id: input.deviation_reason_id ?? null,
        deviation_comment: input.deviation_comment ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) return error(`Failed to save output: ${dbError.message}`, 400);
    return success(data);
  } catch (err) {
    console.error("[OpsControl] actuals POST failed:", err);
    return error("Failed to save output", 500);
  }
}
