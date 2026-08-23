export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { SCHEDULE_ROLES } from "@/lib/ops-control/schedules";
import { updateOcSiteLocationSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH /api/ops-control/site-locations/[id]
// NOTE: editing a site NEVER rewrites history — confirmed schedule versions
// carry their own customer_snapshot and read only that.
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateOcSiteLocationSchema);
    if (parsed.error) return parsed.error;

    const { data: before } = await supabaseAdmin
      .from("oc_site_locations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!before) return notFound("Site location");

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_site_locations")
      .update(parsed.data)
      .eq("id", id)
      .select("*")
      .single();
    if (dbError) return error(`Failed to update site: ${dbError.message}`, 400);

    await logOcAudit({
      entity: "oc_site_locations",
      entity_id: id,
      action: "updated",
      before_value: before,
      after_value: parsed.data,
      performed_by: auth.user.id,
    });
    return success(data);
  } catch (err) {
    console.error("[OpsControl] site-locations PATCH failed:", err);
    return error("Failed to update site location", 500);
  }
}
