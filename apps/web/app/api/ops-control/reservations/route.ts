export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, created, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import {
  INVENTORY_READ_ROLES,
  INVENTORY_WRITE_ROLES,
  loadInventory,
  operationalToday,
} from "@/lib/ops-control/inventory-service";
import { remainingQty } from "@/lib/ops-control/fulfilment";
import { createOcReservationSchema } from "@maiyuri/shared";

const MAX_ROWS = 1000;

/** GET /api/ops-control/reservations[?so_line_id=&finished_good_id=&status=] */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { so_line_id, finished_good_id, status } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_stock_reservations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (so_line_id) query = query.eq("so_line_id", so_line_id);
    if (finished_good_id) query = query.eq("finished_good_id", finished_good_id);
    // Default to active: released and consumed rows are history, and a screen
    // that mixes them into the live picture overstates what is spoken for.
    query = query.eq("status", status || "active");

    const { data, error: dbError } = await query;
    if (dbError) return error("Failed to load reservations", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] reservations GET failed:", err);
    return error("Failed to load reservations", 500);
  }
}

/**
 * POST /api/ops-control/reservations — earmark free stock for an SO line.
 *
 * Two things are refused outright rather than warned about, because both would
 * make the app promise bricks that do not exist:
 *
 *   1. Reserving more than the line still needs.
 *   2. Reserving more than is free in the matching bucket — curing stock can
 *      be reserved (PRD §4, reservations survive curing), but only up to what
 *      is actually curing and unspoken for.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcReservationSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;
    const today = operationalToday();
    const availableFrom = input.available_from ?? null;

    const { data: line, error: lineError } = await supabaseAdmin
      .from("oc_sales_order_lines")
      .select(
        "id, finished_good_id, qty_ordered, qty_delivered, is_demand, source_active, order_name",
      )
      .eq("id", input.so_line_id)
      .single();
    if (lineError || !line) return error("Sales order line not found", 404);

    const soLine = line as {
      id: string;
      finished_good_id: string | null;
      qty_ordered: number;
      qty_delivered: number;
      is_demand: boolean;
      source_active: boolean;
      order_name: string | null;
    };
    if (!soLine.is_demand || !soLine.source_active) {
      return error("Only an active demand line can hold a reservation", 400);
    }
    if (soLine.finished_good_id !== input.finished_good_id) {
      return error("Reservation product does not match the sales order line", 400);
    }

    // What the line still needs, less what is already reserved against it.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("oc_stock_reservations")
      .select("quantity")
      .eq("so_line_id", input.so_line_id)
      .eq("status", "active");
    if (existingError) return error("Failed to check existing reservations", 500);
    const alreadyReserved = ((existing ?? []) as { quantity: number }[]).reduce(
      (sum, r) => sum + Number(r.quantity),
      0,
    );
    const outstanding =
      remainingQty(Number(soLine.qty_ordered), Number(soLine.qty_delivered)) -
      alreadyReserved;
    if (input.quantity > outstanding) {
      return error(
        `Cannot reserve ${input.quantity}: the line still needs ${outstanding}`,
        409,
      );
    }

    const products = await loadInventory(today);
    const product = products.find((p) => p.finished_good_id === input.finished_good_id);
    if (!product) return error("Product not found or inactive", 404);

    const isCuring = availableFrom !== null && availableFrom > today;
    const free = isCuring ? product.freeCuring : product.freeReady;
    if (input.quantity > free) {
      return error(
        `Cannot reserve ${input.quantity}: only ${free} ${
          isCuring ? "curing" : "ready"
        } units are free`,
        409,
      );
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_stock_reservations")
      .insert({
        so_line_id: input.so_line_id,
        finished_good_id: input.finished_good_id,
        quantity: input.quantity,
        available_from: availableFrom,
        status: "active",
        source_type: "manual",
        reason: input.reason ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) return error(`Failed to create reservation: ${dbError.message}`, 400);

    await logOcAudit({
      entity: "oc_stock_reservations",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: { ...input, order_name: soLine.order_name },
      reason: input.reason ?? null,
      performed_by: auth.user.id,
    });
    return created(data);
  } catch (err) {
    console.error("[OpsControl] reservations POST failed:", err);
    return error("Failed to create reservation", 500);
  }
}
