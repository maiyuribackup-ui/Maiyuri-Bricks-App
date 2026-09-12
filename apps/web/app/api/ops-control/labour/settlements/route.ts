export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LABOUR_SETTLE_ROLES } from "@/lib/ops-control/labour-service";
import { canTransition, type SettlementStatus } from "@/lib/ops-control/labour";
import { settleOcLabourWeekSchema } from "@maiyuri/shared";

/** GET — recent settlements, for the history strip. */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, LABOUR_SETTLE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_labour_settlements")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(26);
    if (dbError) return error("Failed to load settlements", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] settlements GET failed:", err);
    return error("Failed to load settlements", 500);
  }
}

/**
 * POST — move a week along the settlement ladder.
 *
 * The RPC attaches every unsettled entry in the week and snapshots the totals
 * in the same transaction, so an approved figure always matches exactly the
 * entries it covers. The transition legality is checked here first purely to
 * give a readable message; the database enforces the locked-week rule
 * independently, which is the one that actually protects paid work.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, LABOUR_SETTLE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, settleOcLabourWeekSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: existing } = await supabaseAdmin
      .from("oc_labour_settlements")
      .select("status")
      .eq("week_start", input.week_start)
      .maybeSingle();
    const current = ((existing as { status: SettlementStatus } | null)?.status ??
      "draft") as SettlementStatus;

    if (!canTransition(current, input.status)) {
      return error(
        current === "locked"
          ? `Week ${input.week_start} is locked. Corrections are recorded as a differential in the current week.`
          : `A ${current} settlement cannot go back to ${input.status}`,
        409,
      );
    }

    const { data, error: rpcError } = await supabaseAdmin.rpc("oc_settle_labour_week", {
      p_week_start: input.week_start,
      p_status: input.status,
      p_user: auth.user.id,
      p_expected_lock: input.lock_version ?? null,
    });
    if (rpcError) {
      if (rpcError.code === "40001") {
        return error("This settlement changed since you loaded it — reload and try again", 409);
      }
      return error(rpcError.message, 400);
    }
    return success(data);
  } catch (err) {
    console.error("[OpsControl] settlement POST failed:", err);
    return error("Failed to update settlement", 500);
  }
}
