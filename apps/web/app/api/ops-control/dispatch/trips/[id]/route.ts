export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DISPATCH_ROLES } from "@/lib/ops-control/dispatch";
import { updateOcTripSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateOcTripSchema);
    if (parsed.error) return parsed.error;
    const { lock_version, ...fields } = parsed.data;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_trips")
      .update({ ...fields, lock_version: lock_version + 1 })
      .eq("id", id)
      .eq("lock_version", lock_version)
      .select("*")
      .maybeSingle();
    if (dbError) return error(`Failed to update trip: ${dbError.message}`, 400);
    if (!data) {
      return error("This trip changed since you loaded it — reload and try again", 409);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] trip PATCH failed:", err);
    return error("Failed to update trip", 500);
  }
}

/** DELETE — refused once anything has been loaded against the trip. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const { data: stops } = await supabaseAdmin
      .from("oc_trip_stops")
      .select("id")
      .eq("trip_id", id);
    const stopIds = ((stops ?? []) as { id: string }[]).map((s) => s.id);
    if (stopIds.length > 0) {
      const { data: completed } = await supabaseAdmin
        .from("oc_trip_load_lines")
        .select("id")
        .in("stop_id", stopIds)
        .neq("status", "draft")
        .limit(1);
      if ((completed ?? []).length > 0) {
        return error("This trip has completed deliveries and cannot be removed", 409);
      }
    }

    const { error: dbError } = await supabaseAdmin.from("oc_trips").delete().eq("id", id);
    if (dbError) return error(`Failed to remove trip: ${dbError.message}`, 400);
    return success({ id, deleted: true });
  } catch (err) {
    console.error("[OpsControl] trip DELETE failed:", err);
    return error("Failed to remove trip", 500);
  }
}
