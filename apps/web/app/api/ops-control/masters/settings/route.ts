export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOcSettings } from "@/lib/ops-control/settings";
import { logOcAudit } from "@/lib/ops-control/audit";
import { updateOcSettingsSchema } from "@maiyuri/shared";

// GET /api/ops-control/masters/settings — the operational thresholds every
// calculation reads. Any authenticated user may read them; they drive UI
// banding as well as server-side rules.
export async function GET() {
  try {
    return success(await getOcSettings());
  } catch (err) {
    console.error("[OpsControl] settings GET failed:", err);
    return error("Failed to load operational settings", 500);
  }
}

// PATCH /api/ops-control/masters/settings
// Changing a threshold changes how every warning bands, so this is restricted
// to founder/owner and audited with the before/after values (PRD §74).
export async function PATCH(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, updateOcSettingsSchema);
    if (parsed.error) return parsed.error;

    const before = await getOcSettings();

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_settings")
      .update({ ...parsed.data, updated_by: auth.user.id })
      .eq("id", 1)
      .select("*")
      .single();

    if (dbError) {
      // The CHECK constraints (yellow <= green, amber <= red) surface here.
      return error(`Failed to update settings: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_settings",
      entity_id: "1",
      action: "updated",
      before_value: before,
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(await getOcSettings());
  } catch (err) {
    console.error("[OpsControl] settings PATCH failed:", err);
    return error("Failed to update operational settings", 500);
  }
}
