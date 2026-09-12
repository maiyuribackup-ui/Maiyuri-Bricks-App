export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DISPATCH_ROLES } from "@/lib/ops-control/dispatch";
import { updateOcLoadLineSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH — the driver's report, saved as a DRAFT.
 *
 * Deliberately does NOT enforce the reconciliation identity. The driver
 * reports in stages — loaded on departure, the rest on return — and a row
 * that does not yet balance must still be savable. COMPLETE is where
 * "every loaded brick accounted for" becomes non-negotiable (PRD §7).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateOcLoadLineSchema);
    if (parsed.error) return parsed.error;
    const { lock_version, ...fields } = parsed.data;

    const { data: existing } = await supabaseAdmin
      .from("oc_trip_load_lines")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return error("Load line not found", 404);
    if ((existing as { status: string }).status !== "draft") {
      return error(
        "This delivery is already completed — record an adjustment instead of editing it",
        409,
      );
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_trip_load_lines")
      .update({ ...fields, lock_version: lock_version + 1 })
      .eq("id", id)
      .eq("lock_version", lock_version)
      .select("*")
      .maybeSingle();
    if (dbError) return error(`Failed to save delivery: ${dbError.message}`, 400);
    if (!data) {
      return error("This entry changed since you loaded it — reload and try again", 409);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] load-line PATCH failed:", err);
    return error("Failed to save delivery", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const { data: existing } = await supabaseAdmin
      .from("oc_trip_load_lines")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return error("Load line not found", 404);
    if ((existing as { status: string }).status !== "draft") {
      return error("A completed delivery cannot be removed", 409);
    }
    const { error: dbError } = await supabaseAdmin
      .from("oc_trip_load_lines")
      .delete()
      .eq("id", id);
    if (dbError) return error(`Failed to remove load: ${dbError.message}`, 400);
    return success({ id, deleted: true });
  } catch (err) {
    console.error("[OpsControl] load-line DELETE failed:", err);
    return error("Failed to remove load", 500);
  }
}
