export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { INVENTORY_WRITE_ROLES } from "@/lib/ops-control/inventory-service";
import { transferOcReservationSchema } from "@maiyuri/shared";

/**
 * POST /api/ops-control/reservations/transfer — move reserved stock between
 * sales order lines.
 *
 * This is one database transaction, not two writes (PRD §8.3). Releasing from
 * SO-A and creating for SO-B as separate calls has a failure mode where SO-A
 * loses 900 bricks and SO-B never receives them; the RPC makes that state
 * unreachable, and writes its own audit row inside the same transaction.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, transferOcReservationSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data, error: rpcError } = await supabaseAdmin.rpc("oc_transfer_reservation", {
      p_reservation_id: input.reservation_id,
      p_to_so_line_id: input.to_so_line_id,
      p_quantity: input.quantity,
      p_user: auth.user.id,
      p_reason: input.reason,
      p_expected_lock: input.lock_version,
    });

    if (rpcError) {
      // The RPC raises serialization_failure for a stale lock_version — the
      // reservation moved under the operator, so this is a 409 to retry from
      // fresh data, not a 400 telling them their input was wrong.
      if (rpcError.code === "40001") {
        return error(
          "This reservation changed since you loaded it — reload and try again",
          409,
        );
      }
      return error(rpcError.message, 400);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] reservation transfer failed:", err);
    return error("Failed to transfer reservation", 500);
  }
}
