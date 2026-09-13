export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { pnlAccountLines } from "@/lib/ceo/pnl";

/**
 * GET /api/ceo/pnl/lines?account_id=&month=YYYY-MM&kind=income|expense —
 * the journal entries behind one P&L account row. Founder/owner only.
 */
const CEO_ROLES = ["founder", "owner"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!CEO_ROLES.includes(user.role)) return error("Not permitted", 403);

    const params = new URL(request.url).searchParams;
    const accountId = Number(params.get("account_id"));
    const month = params.get("month") ?? "";
    const kind = params.get("kind") === "income" ? "income" : "expense";
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return error("account_id required", 400);
    }
    if (!MONTH_RE.test(month)) return error("month must be YYYY-MM", 400);

    return success(await pnlAccountLines(accountId, month, kind));
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[CEO] pnl lines failed:", err);
    return error("Failed to load journal entries", 500);
  }
}
