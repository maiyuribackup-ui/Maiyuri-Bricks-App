export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { error, created, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DISPATCH_ROLES } from "@/lib/ops-control/dispatch";
import { createOcLoadLineSchema } from "@maiyuri/shared";

/**
 * POST — put a product on the vehicle for a stop.
 *
 * When the load names a sales order line, that line must be active demand for
 * the SAME product: loading 8" against a 6" order would consume the wrong
 * reservation at completion and credit the customer for bricks they did not
 * receive.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcLoadLineSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    if (input.so_line_id) {
      const { data: soLine } = await supabaseAdmin
        .from("oc_sales_order_lines")
        .select("finished_good_id, is_demand, source_active")
        .eq("id", input.so_line_id)
        .maybeSingle();
      if (!soLine) return error("Sales order line not found", 404);
      const line = soLine as {
        finished_good_id: string | null;
        is_demand: boolean;
        source_active: boolean;
      };
      if (!line.is_demand || !line.source_active) {
        return error("Only an active demand line can be loaded against", 400);
      }
      if (line.finished_good_id !== input.finished_good_id) {
        return error(
          "That sales order line is for a different product than this load",
          400,
        );
      }
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_trip_load_lines")
      .insert({
        stop_id: input.stop_id,
        finished_good_id: input.finished_good_id,
        so_line_id: input.so_line_id ?? null,
        planned_qty: input.planned_qty,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) return error(`Failed to add load: ${dbError.message}`, 400);
    return created(data);
  } catch (err) {
    console.error("[OpsControl] load-lines POST failed:", err);
    return error("Failed to add load", 500);
  }
}
