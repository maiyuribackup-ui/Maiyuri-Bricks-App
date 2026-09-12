export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runDemandSync } from "@/lib/ops-control/odoo-demand";

// POST /api/ops-control/sales-orders/sync — pull ALL open Odoo sales orders,
// classify every line, apply atomically. Callable by production roles
// ("Sync Now") or by the scheduled workflow with the cron secret.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron =
    !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;

  let triggeredBy: string | null = null;
  if (!isCron) {
    const auth = await requireProductionRole(request);
    if (auth.errorResponse) return auth.errorResponse;
    triggeredBy = auth.user.id;
  }

  try {
    const result = await runDemandSync({
      source: isCron ? "cron" : "manual",
      triggeredBy,
    });
    return success(result);
  } catch (err) {
    // The run row already carries the error; surface it too (PRD §85 —
    // sync errors must be visible, never swallowed).
    const message = err instanceof Error ? err.message : "Demand sync failed";
    console.error("[OpsControl] demand sync failed:", err);
    return error(message, 502);
  }
}

// GET /api/ops-control/sales-orders/sync — recent runs, newest first.
// Answers "why hasn't this order appeared?" — check whether 00:20 completed.
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_sync_runs")
      .select("*")
      .eq("kind", "demand")
      .order("started_at", { ascending: false })
      .limit(20);
    if (dbError) return error("Failed to load sync runs", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] sync runs GET failed:", err);
    return error("Failed to load sync runs", 500);
  }
}
