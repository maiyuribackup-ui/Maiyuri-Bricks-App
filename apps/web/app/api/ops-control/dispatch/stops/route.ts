export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { error, created, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DISPATCH_ROLES } from "@/lib/ops-control/dispatch";
import { createOcTripStopSchema } from "@maiyuri/shared";

/** POST — add a stop to a trip. Sequence is allocated as the next in order. */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcTripStopSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: last } = await supabaseAdmin
      .from("oc_trip_stops")
      .select("sequence")
      .eq("trip_id", input.trip_id)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sequence =
      input.sequence ?? ((last as { sequence: number } | null)?.sequence ?? 0) + 1;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_trip_stops")
      .insert({
        trip_id: input.trip_id,
        sequence,
        odoo_partner_id: input.odoo_partner_id ?? null,
        customer_name: input.customer_name ?? null,
        site_location_id: input.site_location_id ?? null,
        schedule_line_id: input.schedule_line_id ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (dbError) {
      if (dbError.code === "23505") {
        return error(`Stop ${sequence} already exists on this trip`, 409);
      }
      return error(`Failed to add stop: ${dbError.message}`, 400);
    }
    return created(data);
  } catch (err) {
    console.error("[OpsControl] stops POST failed:", err);
    return error("Failed to add stop", 500);
  }
}
