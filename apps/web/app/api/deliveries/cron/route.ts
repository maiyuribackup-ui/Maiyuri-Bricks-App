export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { pullDeliveriesFromOdoo } from "@/lib/delivery-service";

// Vercel Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/deliveries/cron - Scheduled sync from Odoo
// Configured in vercel.json to run every 5 minutes
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret if configured
    if (CRON_SECRET) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return error("Unauthorized", 401);
      }
    }

    // Sync deliveries from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

    const result = await pullDeliveriesFromOdoo(dateFrom);

    if (!result.success) {
      console.error("Cron sync failed:", result.error);
      return error(result.message, 500);
    }

    console.log("Cron sync completed:", result.data);
    return success(result.data);
  } catch (err) {
    console.error("Error in POST /api/deliveries/cron:", err);
    return error("Internal server error", 500);
  }
}

// GET handler for manual trigger and Vercel Cron
export async function GET(request: NextRequest) {
  return POST(request);
}
