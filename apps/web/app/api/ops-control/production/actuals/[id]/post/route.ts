export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { postOcProductionActualSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /production/actuals/[id]/post — the moment the numbers become real.
 *
 * Everything happens inside oc_post_production_actual(): the assignment check,
 * the inventory receipt dated for curing, the reservations, the status change.
 * This handler deliberately contains no business logic — splitting the work
 * across handler and RPC is exactly how a half-posted actual would become
 * possible (PRD §8.3).
 *
 * Safe to call twice: a retried request returns the already-posted result
 * rather than doubling the stock (PRD §6).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, postOcProductionActualSchema);
    if (parsed.error) return parsed.error;

    const { data, error: rpcError } = await supabaseAdmin.rpc(
      "oc_post_production_actual",
      {
        p_actual_id: id,
        p_user: auth.user.id,
        p_expected_lock: parsed.data.lock_version,
      },
    );

    if (rpcError) {
      // A stale lock means someone else moved this entry; the operator should
      // see what changed before posting, not overwrite it.
      if (rpcError.code === "40001") {
        return error("This entry changed since you loaded it — reload and try again", 409);
      }
      // The assignment and curing-configuration failures are operator-
      // actionable, so their messages are passed through rather than masked.
      return error(rpcError.message, 400);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] production post failed:", err);
    return error("Failed to post production", 500);
  }
}
