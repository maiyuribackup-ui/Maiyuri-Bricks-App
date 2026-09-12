export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { SCHEDULE_ROLES } from "@/lib/ops-control/schedules";
import { createOcSiteLocationSchema } from "@maiyuri/shared";

// GET /api/ops-control/site-locations?odoo_partner_id=
export async function GET(request: NextRequest) {
  try {
    const { odoo_partner_id } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_site_locations")
      .select("*")
      .eq("active", true)
      .order("customer_name");
    if (odoo_partner_id) query = query.eq("odoo_partner_id", Number(odoo_partner_id));
    const { data, error: dbError } = await query.limit(500);
    if (dbError) return error("Failed to load site locations", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] site-locations GET failed:", err);
    return error("Failed to load site locations", 500);
  }
}

// POST /api/ops-control/site-locations — sales maintain delivery locations
// (PRD §7.3, §51).
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcSiteLocationSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_site_locations")
      .insert({ ...parsed.data, created_by: auth.user.id })
      .select("*")
      .single();
    if (dbError) return error(`Failed to create site: ${dbError.message}`, 400);
    await logOcAudit({
      entity: "oc_site_locations",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: parsed.data,
      performed_by: auth.user.id,
    });
    return success(data);
  } catch (err) {
    console.error("[OpsControl] site-locations POST failed:", err);
    return error("Failed to create site location", 500);
  }
}
