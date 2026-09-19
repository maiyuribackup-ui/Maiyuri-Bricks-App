export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { INVENTORY_WRITE_ROLES } from "@/lib/ops-control/inventory-service";
import { releaseOcReservationSchema } from "@maiyuri/shared";

/**
 * POST /api/ops-control/reservations/[id]/release — hand stock back to free.
 *
 * A release changes what the business may promise other customers, so it needs
 * a stated reason and is refused on a stale `lock_version`: releasing a
 * reservation someone else has just transferred would silently undo their work.
 */
interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, INVENTORY_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, releaseOcReservationSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: existing, error: loadError } = await supabaseAdmin
      .from("oc_stock_reservations")
      .select("id, so_line_id, quantity, status, lock_version")
      .eq("id", id)
      .single();
    if (loadError || !existing) return error("Reservation not found", 404);

    const current = existing as {
      id: string;
      so_line_id: string;
      quantity: number;
      status: string;
      lock_version: number;
    };
    if (current.status !== "active") {
      return error(`Only an active reservation can be released (it is ${current.status})`, 409);
    }

    // Guard on lock_version in the UPDATE itself, not just the read above:
    // between the two, another request may have moved this row.
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_stock_reservations")
      .update({
        status: "released",
        released_at: new Date().toISOString(),
        reason: input.reason,
        lock_version: current.lock_version + 1,
      })
      .eq("id", id)
      .eq("status", "active")
      .eq("lock_version", input.lock_version)
      .select("*")
      .maybeSingle();
    if (dbError) return error(`Failed to release reservation: ${dbError.message}`, 400);
    if (!data) {
      return error(
        "This reservation changed since you loaded it — reload and try again",
        409,
      );
    }

    await logOcAudit({
      entity: "oc_stock_reservations",
      entity_id: id,
      action: "released",
      before_value: current,
      after_value: { status: "released" },
      reason: input.reason,
      performed_by: auth.user.id,
    });
    return success(data);
  } catch (err) {
    console.error("[OpsControl] reservation release failed:", err);
    return error("Failed to release reservation", 500);
  }
}
