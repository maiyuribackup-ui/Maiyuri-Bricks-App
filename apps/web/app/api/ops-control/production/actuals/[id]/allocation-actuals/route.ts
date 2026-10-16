export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { setOcAllocationActualsSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT — replace the whole assignment set for one actual.
 *
 * Replace rather than patch because the operator is answering one question —
 * "where did this output go?" — and a partial update leaves a set that adds
 * up to something nobody chose. The database freezes these rows once the
 * actual is posted, so this only ever edits a draft.
 *
 * Σ actual_qty = accepted_qty is NOT enforced here. That is the POST-time
 * rule (PRD §5): a half-assigned draft is legal while Rajesh works, and only
 * posting demands that every accepted brick has a home.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, setOcAllocationActualsSchema);
    if (parsed.error) return parsed.error;
    const { entries, lock_version } = parsed.data;

    const { data: actual } = await supabaseAdmin
      .from("oc_production_actuals")
      .select("id, status, lock_version, shift_id, finished_good_id")
      .eq("id", id)
      .maybeSingle();
    if (!actual) return error("Production entry not found", 404);
    const row = actual as {
      status: string;
      lock_version: number;
      shift_id: string;
      finished_good_id: string;
    };
    if (row.status !== "draft") {
      return error(`This output is already ${row.status} — its assignments are frozen`, 409);
    }
    if (row.lock_version !== lock_version) {
      return error("This entry changed since you loaded it — reload and try again", 409);
    }

    // Every allocation must belong to the SAME shift and product as the
    // actual. Without this an operator could assign 8" output to a 6" plan
    // line and produce a reservation that can never be dispatched.
    if (entries.length > 0) {
      const { data: allocs } = await supabaseAdmin
        .from("oc_production_allocations")
        .select("id, oc_production_plan_lines!inner(shift_id, finished_good_id)")
        .in(
          "id",
          entries.map((e) => e.allocation_id),
        );
      const rows = (allocs ?? []) as unknown as {
        id: string;
        oc_production_plan_lines: { shift_id: string; finished_good_id: string };
      }[];
      if (rows.length !== new Set(entries.map((e) => e.allocation_id)).size) {
        return error("One or more allocations do not exist", 400);
      }
      const mismatched = rows.find(
        (a) =>
          a.oc_production_plan_lines.shift_id !== row.shift_id ||
          a.oc_production_plan_lines.finished_good_id !== row.finished_good_id,
      );
      if (mismatched) {
        return error(
          "An allocation belongs to a different shift or product than this output",
          400,
        );
      }
    }

    const { error: delError } = await supabaseAdmin
      .from("oc_production_allocation_actuals")
      .delete()
      .eq("actual_id", id);
    if (delError) return error(`Failed to update assignments: ${delError.message}`, 400);

    if (entries.length > 0) {
      const { error: insError } = await supabaseAdmin
        .from("oc_production_allocation_actuals")
        .insert(
          entries.map((e) => ({
            actual_id: id,
            allocation_id: e.allocation_id,
            actual_qty: e.actual_qty,
            note: e.note ?? null,
            assigned_by: auth.user.id,
          })),
        );
      if (insError) return error(`Failed to save assignments: ${insError.message}`, 400);
    }

    const { data: refreshed } = await supabaseAdmin
      .from("oc_production_allocation_actuals")
      .select("*")
      .eq("actual_id", id);
    return success(refreshed ?? []);
  } catch (err) {
    console.error("[OpsControl] allocation-actuals PUT failed:", err);
    return error("Failed to update assignments", 500);
  }
}
