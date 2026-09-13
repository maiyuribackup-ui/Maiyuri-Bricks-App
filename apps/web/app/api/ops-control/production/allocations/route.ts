export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { error, created, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { createOcAllocationSchema } from "@maiyuri/shared";

/**
 * POST — say WHY a plan line is being produced: for a named sales order, or
 * for stock (PRD §24).
 *
 * A sales-order allocation is checked against the line it names: retired or
 * non-demand lines are refused, and the product must match, because an
 * allocation to the wrong product would produce a reservation that can never
 * be dispatched against that order.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcAllocationSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: planLine } = await supabaseAdmin
      .from("oc_production_plan_lines")
      .select("id, finished_good_id")
      .eq("id", input.plan_line_id)
      .maybeSingle();
    if (!planLine) return error("Plan line not found", 404);
    const line = planLine as { id: string; finished_good_id: string };

    if (input.purpose === "sales_order") {
      const { data: soLine } = await supabaseAdmin
        .from("oc_sales_order_lines")
        .select("id, finished_good_id, is_demand, source_active, order_name")
        .eq("id", input.so_line_id as string)
        .maybeSingle();
      if (!soLine) return error("Sales order line not found", 404);
      const so = soLine as {
        finished_good_id: string | null;
        is_demand: boolean;
        source_active: boolean;
      };
      if (!so.is_demand || !so.source_active) {
        return error("Only an active demand line can receive an allocation", 400);
      }
      if (so.finished_good_id !== line.finished_good_id) {
        return error(
          "That sales order line is for a different product than this plan line",
          400,
        );
      }
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_allocations")
      .insert({
        plan_line_id: input.plan_line_id,
        purpose: input.purpose,
        so_line_id: input.so_line_id ?? null,
        stock_ref: input.stock_ref ?? null,
        planned_qty: input.planned_qty,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) return error(`Failed to add allocation: ${dbError.message}`, 400);
    return created(data);
  } catch (err) {
    console.error("[OpsControl] allocations POST failed:", err);
    return error("Failed to add allocation", 500);
  }
}
