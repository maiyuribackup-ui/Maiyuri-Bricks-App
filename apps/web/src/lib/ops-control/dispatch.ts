/**
 * Operations Control — dispatch data access (PRD §41–§56).
 *
 * As with production, the database owns the invariants that must hold
 * whoever writes — the reconciliation identity, the completed-row freeze,
 * the atomic completion. This module owns the day view the screen renders
 * from, and the capacity warnings, which are advisory and therefore belong
 * in application code rather than in a constraint.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  tripUtilisation,
  tripWarnings,
  reconcileDelivery,
  type TripWarning,
  type UtilisationResult,
} from "@/lib/ops-control/trip-capacity";
import type { VehicleCapacity } from "@/lib/ops-control/rates";

/** Dispatch is internal operations; sales has no business planning trips. */
export const DISPATCH_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
] as const;

export interface LoadLine {
  id: string;
  finished_good_id: string;
  product_name: string | null;
  so_line_id: string | null;
  order_name: string | null;
  planned_qty: number;
  status: "draft" | "completed" | "adjusted";
  actual_loaded_qty: number | null;
  actual_unloaded_qty: number | null;
  returned_qty: number;
  damaged_qty: number;
  lost_or_short_qty: number;
  completed_at: string | null;
  lock_version: number;
  /** what COMPLETE will decide, surfaced before the operator presses it */
  reconciliation: ReturnType<typeof reconcileDelivery> | null;
}

export interface TripStop {
  id: string;
  sequence: number;
  customer_name: string | null;
  site_location_id: string | null;
  status: string;
  load_lines: LoadLine[];
}

export interface TripView {
  id: string;
  trip_date: string;
  trip_no: number;
  vehicle_id: string | null;
  vehicle_label: string | null;
  status: string;
  override_reason: string | null;
  lock_version: number;
  stops: TripStop[];
  utilisation: UtilisationResult;
  warnings: TripWarning[];
}

/**
 * Every trip on a date, with its stops, loads, live reconciliation and
 * capacity warnings — one read, for the same reason as the production day.
 */
export async function loadDispatchDay(tripDate: string): Promise<TripView[]> {
  const [tripsRes, vehiclesRes, capacitiesRes, goodsRes, settingsRes] =
    await Promise.all([
      supabaseAdmin
        .from("oc_trips")
        .select("*")
        .eq("trip_date", tripDate)
        .order("trip_no"),
      supabaseAdmin.from("oc_vehicles").select("id, vehicle_type, registration"),
      supabaseAdmin.from("oc_vehicle_capacities").select("*").eq("active", true),
      supabaseAdmin.from("finished_goods").select("id, name"),
      supabaseAdmin
        .from("oc_settings")
        .select("load_green_min_pct, load_yellow_min_pct, load_red_above_pct, normal_max_trips_per_day")
        .limit(1)
        .maybeSingle(),
    ]);
  if (tripsRes.error) throw new Error(`Failed to load trips: ${tripsRes.error.message}`);

  const trips = (tripsRes.data ?? []) as {
    id: string;
    trip_date: string;
    trip_no: number;
    vehicle_id: string | null;
    status: string;
    override_reason: string | null;
    lock_version: number;
  }[];
  if (trips.length === 0) return [];

  const [stopsRes] = await Promise.all([
    supabaseAdmin
      .from("oc_trip_stops")
      .select("*")
      .in("trip_id", trips.map((t) => t.id))
      .order("sequence"),
  ]);
  if (stopsRes.error) throw new Error(`Failed to load stops: ${stopsRes.error.message}`);

  const stops = (stopsRes.data ?? []) as {
    id: string;
    trip_id: string;
    sequence: number;
    customer_name: string | null;
    site_location_id: string | null;
    status: string;
  }[];

  const linesRes = stops.length
    ? await supabaseAdmin
        .from("oc_trip_load_lines")
        .select("*, oc_sales_order_lines(order_name)")
        .in("stop_id", stops.map((s) => s.id))
    : { data: [], error: null };

  const productName = new Map(
    ((goodsRes.data ?? []) as { id: string; name: string | null }[]).map((g) => [
      g.id,
      g.name,
    ]),
  );
  const vehicleLabel = new Map(
    ((vehiclesRes.data ?? []) as {
      id: string;
      vehicle_type: string | null;
      registration: string | null;
    }[]).map((v) => [v.id, v.registration ?? v.vehicle_type ?? null]),
  );
  const capacities = (capacitiesRes.data ?? []) as VehicleCapacity[];
  const settings = settingsRes.data as {
    load_green_min_pct: number | null;
    load_yellow_min_pct: number | null;
    load_red_above_pct: number | null;
    normal_max_trips_per_day: number | null;
  } | null;
  const thresholds = {
    greenMinPct: Number(settings?.load_green_min_pct ?? 95),
    yellowMinPct: Number(settings?.load_yellow_min_pct ?? 80),
    redAbovePct: Number(settings?.load_red_above_pct ?? 100),
  };
  const normalMaxTripsPerDay = Number(settings?.normal_max_trips_per_day ?? 2);

  const linesByStop = new Map<string, LoadLine[]>();
  for (const raw of (linesRes.data ?? []) as Record<string, unknown>[]) {
    const l = raw as unknown as {
      id: string;
      stop_id: string;
      finished_good_id: string;
      so_line_id: string | null;
      planned_qty: number;
      status: "draft" | "completed" | "adjusted";
      actual_loaded_qty: number | null;
      actual_unloaded_qty: number | null;
      returned_qty: number;
      damaged_qty: number;
      lost_or_short_qty: number;
      completed_at: string | null;
      lock_version: number;
      oc_sales_order_lines: { order_name: string | null } | null;
    };
    const loaded = l.actual_loaded_qty === null ? null : Number(l.actual_loaded_qty);
    const list = linesByStop.get(l.stop_id) ?? [];
    list.push({
      id: l.id,
      finished_good_id: l.finished_good_id,
      product_name: productName.get(l.finished_good_id) ?? null,
      so_line_id: l.so_line_id,
      order_name: l.oc_sales_order_lines?.order_name ?? null,
      planned_qty: Number(l.planned_qty),
      status: l.status,
      actual_loaded_qty: loaded,
      actual_unloaded_qty:
        l.actual_unloaded_qty === null ? null : Number(l.actual_unloaded_qty),
      returned_qty: Number(l.returned_qty),
      damaged_qty: Number(l.damaged_qty),
      lost_or_short_qty: Number(l.lost_or_short_qty),
      completed_at: l.completed_at,
      lock_version: l.lock_version,
      // Only meaningful once something has been loaded; before that there is
      // nothing to reconcile and a "0 unexplained" would be misleading.
      reconciliation:
        loaded === null || loaded <= 0
          ? null
          : reconcileDelivery({
              loaded,
              unloaded: Number(l.actual_unloaded_qty ?? 0),
              returned: Number(l.returned_qty),
              damaged: Number(l.damaged_qty),
              lostOrShort: Number(l.lost_or_short_qty),
            }),
    });
    linesByStop.set(l.stop_id, list);
  }

  return trips.map((t) => {
    const tripStops = stops
      .filter((s) => s.trip_id === t.id)
      .map((s) => ({
        id: s.id,
        sequence: s.sequence,
        customer_name: s.customer_name,
        site_location_id: s.site_location_id,
        status: s.status,
        load_lines: linesByStop.get(s.id) ?? [],
      }));

    // Utilisation is judged on what is PLANNED to go on the vehicle; the
    // actual loaded figure is the driver's report, which arrives later.
    const items = tripStops.flatMap((s) =>
      s.load_lines.map((l) => ({
        finished_good_id: l.finished_good_id,
        quantity: l.planned_qty,
      })),
    );
    const utilisation = t.vehicle_id
      ? tripUtilisation({
          items,
          capacities,
          vehicleId: t.vehicle_id,
          onDate: t.trip_date,
          thresholds,
        })
      : { pct: null, band: "not_evaluated" as const, unpricedProducts: [] };

    return {
      ...t,
      vehicle_label: t.vehicle_id ? (vehicleLabel.get(t.vehicle_id) ?? null) : null,
      stops: tripStops,
      utilisation,
      warnings: tripWarnings({
        utilisation,
        tripNo: t.trip_no,
        normalMaxTripsPerDay,
        productNames: Object.fromEntries(
          [...productName.entries()].map(([k, v]) => [k, v ?? k]),
        ),
      }),
    };
  });
}

/** Vehicles and the reserved stock a load line can legitimately draw on. */
export async function loadDispatchOptions(): Promise<{
  vehicles: { id: string; label: string }[];
  products: { id: string; name: string | null }[];
  demand: {
    id: string;
    finished_good_id: string;
    order_name: string | null;
    partner_name: string | null;
    remaining: number;
  }[];
}> {
  const [vehiclesRes, goodsRes, demandRes] = await Promise.all([
    supabaseAdmin
      .from("oc_vehicles")
      .select("id, vehicle_type, registration")
      .eq("active", true),
    supabaseAdmin.from("finished_goods").select("id, name").eq("is_active", true).order("name"),
    supabaseAdmin
      .from("oc_sales_order_lines")
      .select("id, finished_good_id, order_name, partner_name, qty_ordered, qty_delivered")
      .eq("is_demand", true)
      .eq("source_active", true)
      .order("order_name", { ascending: false })
      .limit(500),
  ]);

  return {
    vehicles: ((vehiclesRes.data ?? []) as {
      id: string;
      vehicle_type: string | null;
      registration: string | null;
    }[]).map((v) => ({
      id: v.id,
      label: v.registration ?? v.vehicle_type ?? "Vehicle",
    })),
    products: (goodsRes.data ?? []) as { id: string; name: string | null }[],
    demand: ((demandRes.data ?? []) as {
      id: string;
      finished_good_id: string | null;
      order_name: string | null;
      partner_name: string | null;
      qty_ordered: number;
      qty_delivered: number;
    }[])
      .map((l) => ({
        id: l.id,
        finished_good_id: l.finished_good_id ?? "",
        order_name: l.order_name,
        partner_name: l.partner_name,
        remaining: Math.max(0, Number(l.qty_ordered) - Number(l.qty_delivered)),
      }))
      .filter((l) => l.remaining > 0 && l.finished_good_id),
  };
}
