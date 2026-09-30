export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { createOcVehicleCapacitySchema } from "@maiyuri/shared";

const SELECT = "*, oc_vehicles(id, vehicle_type), finished_goods(id, name)";

// GET /api/ops-control/masters/vehicle-capacities?vehicle_id&active
export async function GET(request: NextRequest) {
  try {
    const { vehicle_id, active } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_vehicle_capacities")
      .select(SELECT)
      .order("vehicle_id")
      .order("effective_from", { ascending: false });

    if (vehicle_id) query = query.eq("vehicle_id", vehicle_id);
    if (active === "true") query = query.eq("active", true);

    const { data, error: dbError } = await query.limit(500);
    if (dbError) return error("Failed to load vehicle capacities", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] vehicle-capacities GET failed:", err);
    return error("Failed to load vehicle capacities", 500);
  }
}

// POST /api/ops-control/masters/vehicle-capacities
//
// full_load_qty is the maximum NORMAL load, not a legal maximum: a trip that
// exceeds it shows a red warning and still saves (PRD §45, AC-T07). Capacity
// is effective-dated so historical utilisation stays reproducible.
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcVehicleCapacitySchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_vehicle_capacities")
      .insert({
        ...parsed.data,
        effective_to: parsed.data.effective_to ?? null,
        created_by: auth.user.id,
        modified_by: auth.user.id,
      })
      .select(SELECT)
      .single();

    if (dbError) {
      if (dbError.code === "23P01") {
        return error(
          "This period overlaps an existing capacity for the same vehicle and product. Close the current period first.",
          409,
        );
      }
      return error(`Failed to create capacity: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_vehicle_capacities",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] vehicle-capacities POST failed:", err);
    return error("Failed to create vehicle capacity", 500);
  }
}
