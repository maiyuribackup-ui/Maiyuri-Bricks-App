export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { LABOUR_READ_ROLES, loadUnpricedWork } from "@/lib/ops-control/labour-service";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/ops-control/labour/unpriced?from=&to=
 *
 * Work that happened but could not be priced. Not an error state — the rate
 * masters ship empty by design, so on day one everything appears here.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, LABOUR_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { from, to } = parseQuery(request);
    if (!from || !to || !DATE_ONLY.test(from) || !DATE_ONLY.test(to)) {
      return error("from and to must be YYYY-MM-DD dates", 400);
    }
    return success(await loadUnpricedWork(from, to));
  } catch (err) {
    console.error("[OpsControl] unpriced GET failed:", err);
    return error("Failed to load unpriced work", 500);
  }
}
