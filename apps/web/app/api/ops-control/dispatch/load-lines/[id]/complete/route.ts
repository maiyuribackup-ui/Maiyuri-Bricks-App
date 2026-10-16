export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DISPATCH_ROLES } from "@/lib/ops-control/dispatch";
import { completeOcLoadLineSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /dispatch/load-lines/[id]/complete — the delivery becomes real.
 *
 * All of it happens inside oc_complete_delivery_line(): the reconciliation
 * check, the issue movement for everything that left, the return movement for
 * only what came back, consuming the reservation, and the status change. No
 * business logic here — splitting the work is how a half-completed delivery
 * would become possible (PRD §8.3).
 *
 * Safe to call twice (PRD §6): a retried request returns the already-
 * completed result rather than issuing the stock a second time.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, DISPATCH_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, completeOcLoadLineSchema);
    if (parsed.error) return parsed.error;

    const { data, error: rpcError } = await supabaseAdmin.rpc(
      "oc_complete_delivery_line",
      {
        p_load_line_id: id,
        p_user: auth.user.id,
        p_expected_lock: parsed.data.lock_version,
      },
    );

    if (rpcError) {
      if (rpcError.code === "40001") {
        return error("This entry changed since you loaded it — reload and try again", 409);
      }
      // The reconciliation message names exactly how many bricks are
      // unexplained. Masking it would leave the operator with no way to know
      // what to classify.
      return error(rpcError.message, 400);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] delivery complete failed:", err);
    return error("Failed to complete delivery", 500);
  }
}
