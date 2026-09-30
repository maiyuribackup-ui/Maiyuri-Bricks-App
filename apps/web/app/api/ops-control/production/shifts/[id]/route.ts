export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { updateOcProductionShiftSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** PATCH — planned and actual manpower, as an aggregate count (PRD §22). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateOcProductionShiftSchema);
    if (parsed.error) return parsed.error;
    const { lock_version, ...fields } = parsed.data;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_shifts")
      .update({ ...fields, lock_version: lock_version + 1 })
      .eq("id", id)
      .eq("lock_version", lock_version)
      .select("*")
      .maybeSingle();
    if (dbError) return error(`Failed to update shift: ${dbError.message}`, 400);
    if (!data) {
      return error("This shift changed since you loaded it — reload and try again", 409);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] shift PATCH failed:", err);
    return error("Failed to update shift", 500);
  }
}
