export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LABOUR_SETTLE_ROLES, loadUnpricedWork } from "@/lib/ops-control/labour-service";
import { backfillOcLabourSchema } from "@maiyuri/shared";

/**
 * POST — price work that happened before its rate existed.
 *
 * This is the recovery path the whole "skip rather than block" design depends
 * on: enter the rate, run this, and the work is priced at the rate in force
 * ON THE DAY IT HAPPENED, not today's. Safe to run repeatedly — the ledger's
 * unique key makes a second pass a no-op, so it only ever fills gaps.
 *
 * Entries already settled are untouched: the generator writes new rows, and a
 * row that exists is skipped, so a paid week cannot be re-priced.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, LABOUR_SETTLE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, backfillOcLabourSchema);
    if (parsed.error) return parsed.error;
    const { from, to } = parsed.data;
    if (from > to) return error("'from' must not be after 'to'", 400);

    const { rows } = await loadUnpricedWork(from, to);
    // One generator call per source event; the RPC handles every activity
    // that event earns, so de-duplicate on the source rather than the row.
    const sources = new Map<string, { source_type: string; source_id: string }>();
    for (const r of rows) {
      sources.set(`${r.source_type}:${r.source_id}`, {
        source_type: r.source_type,
        source_id: r.source_id,
      });
    }

    let created = 0;
    let stillUnpriced = 0;
    for (const s of sources.values()) {
      const { data, error: rpcError } = await supabaseAdmin.rpc("oc_generate_labour", {
        p_source_type: s.source_type,
        p_source_id: s.source_id,
        p_user: auth.user.id,
      });
      if (rpcError) return error(`Backfill failed: ${rpcError.message}`, 400);
      const result = data as { entries_created: number; skipped_no_rate: number };
      created += Number(result?.entries_created ?? 0);
      stillUnpriced += Number(result?.skipped_no_rate ?? 0);
    }

    return success({
      sources_processed: sources.size,
      entries_created: created,
      still_unpriced: stillUnpriced,
    });
  } catch (err) {
    console.error("[OpsControl] labour backfill failed:", err);
    return error("Failed to backfill labour", 500);
  }
}
