export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { pnlForMonth } from "@/lib/ceo/pnl";

/**
 * GET /api/ceo/pnl?month=YYYY-MM — monthly P&L from Odoo's GL, grouped by
 * account. Founder/owner only.
 */
const CEO_ROLES = ["founder", "owner"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const istMonth = (): string =>
  new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 7);

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!CEO_ROLES.includes(user.role)) return error("Not permitted", 403);

    const raw = new URL(request.url).searchParams.get("month");
    const month = raw && MONTH_RE.test(raw) ? raw : istMonth();

    return success(await pnlForMonth(month));
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[CEO] pnl failed:", err);
    return error("Failed to build the P&L", 500);
  }
}
