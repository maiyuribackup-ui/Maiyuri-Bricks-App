export const dynamic = "force-dynamic";
export const maxDuration = 60; // Odoo + GA4 round-trips (same as the web page)

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { getDailyReport } from "@/lib/daily-report/aggregate";

/**
 * GET /api/daily-report?date=YYYY-MM-DD — the Daily Operations Briefing as
 * JSON for the mobile app. Same aggregator as the web page; management only
 * (it carries finance and receivables figures).
 */
const REPORT_ROLES = ["founder", "owner", "accountant"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today in IST as YYYY-MM-DD (the factory's clock).
const istToday = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!REPORT_ROLES.includes(user.role)) {
      return error("Not permitted", 403);
    }

    const raw = new URL(request.url).searchParams.get("date");
    const date = raw && DATE_RE.test(raw) ? raw : istToday();

    const report = await getDailyReport(date);
    return success(report);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[DailyReport] API failed:", err);
    return error("Failed to build the daily report", 500);
  }
}
