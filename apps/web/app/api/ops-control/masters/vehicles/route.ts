export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { createOcVehicleSchema } from "@maiyuri/shared";

// GET /api/ops-control/masters/vehicles
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_vehicles")
      .select("*")
      .order("vehicle_type");
    if (dbError) return error("Failed to load vehicles", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] vehicles GET failed:", err);
    return error("Failed to load vehicles", 500);
  }
}

// POST /api/ops-control/masters/vehicles
// V1 runs one standard vehicle; the master exists so adding a second is
// configuration rather than a migration (PRD §41).
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcVehicleSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_vehicles")
      .insert(parsed.data)
      .select("*")
      .single();

    if (dbError) {
      if (dbError.code === "23505") {
        return error("A vehicle with that type already exists", 409);
      }
      return error(`Failed to create vehicle: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_vehicles",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] vehicles POST failed:", err);
    return error("Failed to create vehicle", 500);
  }
}
