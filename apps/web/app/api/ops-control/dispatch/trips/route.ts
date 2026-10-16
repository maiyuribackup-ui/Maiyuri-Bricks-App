export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, created, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import {
  DISPATCH_ROLES,
  loadDispatchDay,
  loadDispatchOptions,
} from "@/lib/ops-control/dispatch";
import { operationalToday } from "@/lib/ops-control/inventory-service";
import { createOcTripSchema } from "@maiyuri/shared";

/** GET /api/ops-control/dispatch/trips?date= — the whole day in one read. */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { date } = parseQuery(request);
    const tripDate = date || operationalToday();
    const [trips, options] = await Promise.all([
      loadDispatchDay(tripDate),
      loadDispatchOptions(),
    ]);
    return success({ date: tripDate, trips, ...options });
  } catch (err) {
    console.error("[OpsControl] dispatch trips GET failed:", err);
    return error("Failed to load trips", 500);
  }
}

/**
 * POST — plan a trip.
 *
 * trip_no is allocated automatically as the next free number for the date,
 * because it is a sequence within the day rather than something an operator
 * should have to remember. Going beyond the configured normal trips per day
 * is allowed (PRD §54 — planning exceptions warn, they do not block), but the
 * reason is required and recorded, so "why a third trip on the 12th?" has an
 * answer that outlives whoever authorised it.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcTripSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: settings } = await supabaseAdmin
      .from("oc_settings")
      .select("normal_max_trips_per_day")
      .limit(1)
      .maybeSingle();
    const normalMax = Number(
      (settings as { normal_max_trips_per_day: number | null } | null)
        ?.normal_max_trips_per_day ?? 2,
    );

    const { data: existing } = await supabaseAdmin
      .from("oc_trips")
      .select("trip_no")
      .eq("trip_date", input.trip_date)
      .order("trip_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo =
      input.trip_no ?? ((existing as { trip_no: number } | null)?.trip_no ?? 0) + 1;

    if (nextNo > normalMax && !input.override_reason?.trim()) {
      return error(
        `Trip ${nextNo} is beyond the usual ${normalMax} per day — give a reason to record it`,
        400,
      );
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_trips")
      .insert({
        trip_date: input.trip_date,
        trip_no: nextNo,
        vehicle_id: input.vehicle_id ?? null,
        notes: input.notes ?? null,
        override_reason: input.override_reason?.trim() || null,
        override_by: input.override_reason?.trim() ? auth.user.id : null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) {
      if (dbError.code === "23505") {
        return error(`Trip ${nextNo} already exists for ${input.trip_date}`, 409);
      }
      return error(`Failed to create trip: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_trips",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: { ...input, trip_no: nextNo },
      reason: input.override_reason ?? null,
      performed_by: auth.user.id,
    });
    return created(data);
  } catch (err) {
    console.error("[OpsControl] dispatch trips POST failed:", err);
    return error("Failed to create trip", 500);
  }
}
