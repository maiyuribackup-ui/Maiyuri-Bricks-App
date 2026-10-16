export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DELETE — remove an allocation. Refused once output has been assigned to it,
 * because that assignment is what a reservation traces back through.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const { data: assigned } = await supabaseAdmin
      .from("oc_production_allocation_actuals")
      .select("id")
      .eq("allocation_id", id)
      .limit(1);
    if ((assigned ?? []).length > 0) {
      return error(
        "Output has already been assigned to this allocation — it cannot be removed",
        409,
      );
    }

    const { error: dbError } = await supabaseAdmin
      .from("oc_production_allocations")
      .delete()
      .eq("id", id);
    if (dbError) return error(`Failed to remove allocation: ${dbError.message}`, 400);
    return success({ id, deleted: true });
  } catch (err) {
    console.error("[OpsControl] allocation DELETE failed:", err);
    return error("Failed to remove allocation", 500);
  }
}
