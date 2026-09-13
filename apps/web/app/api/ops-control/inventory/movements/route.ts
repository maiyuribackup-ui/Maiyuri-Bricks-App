export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, created, parseBody, parseQuery } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import {
  INVENTORY_READ_ROLES,
  INVENTORY_WRITE_ROLES,
  operationalToday,
} from "@/lib/ops-control/inventory-service";
import { createOcInventoryMovementSchema } from "@maiyuri/shared";

const MAX_ROWS = 500;

/**
 * GET /api/ops-control/inventory/movements[?finished_good_id=&from=&to=]
 *
 * The ledger itself — OC's explanation of how the physical total was reached.
 */
export async function GET(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { finished_good_id, from, to } = parseQuery(request);
    let query = supabaseAdmin
      .from("oc_inventory_movements")
      .select("*")
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (finished_good_id) query = query.eq("finished_good_id", finished_good_id);
    if (from) query = query.gte("movement_date", from);
    if (to) query = query.lte("movement_date", to);

    const { data, error: dbError } = await query;
    if (dbError) return error("Failed to load inventory movements", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] inventory movements GET failed:", err);
    return error("Failed to load inventory movements", 500);
  }
}

/**
 * POST /api/ops-control/inventory/movements — a MANUAL movement only.
 *
 * Production receipts and delivery issues are written by their own
 * transactional RPCs in Phases 4-5; allowing them here would give the ledger
 * a second, unaudited way to move stock. What a human may post by hand is an
 * opening position, a deliberate adjustment, or an accepted reconciliation —
 * the last two with a reason, enforced by both the zod schema and a DB CHECK.
 *
 * The row is append-only once written (DB trigger): a mistake is corrected by
 * posting an opposing movement, never by editing history.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, INVENTORY_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcInventoryMovementSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    // One opening position per product, or the starting line moves under us.
    if (input.movement_type === "opening") {
      const { data: existing, error: openingError } = await supabaseAdmin
        .from("oc_inventory_movements")
        .select("id")
        .eq("finished_good_id", input.finished_good_id)
        .eq("movement_type", "opening")
        .limit(1);
      if (openingError) return error("Failed to check opening balance", 500);
      if ((existing ?? []).length > 0) {
        return error(
          "An opening balance already exists for this product; post an adjustment instead",
          409,
        );
      }
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_inventory_movements")
      .insert({
        movement_type: input.movement_type,
        finished_good_id: input.finished_good_id,
        quantity: input.quantity,
        movement_date: input.movement_date ?? operationalToday(),
        // Manual movements are never curing: an opening or corrective figure
        // describes stock that already exists in whatever state it is in.
        available_from: null,
        source_type: "manual",
        // Manual movements do not originate from Odoo, so there is nothing to
        // write back and nothing to wait for.
        odoo_sync_status: "not_applicable",
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (dbError) return error(`Failed to record movement: ${dbError.message}`, 400);

    await logOcAudit({
      entity: "oc_inventory_movements",
      entity_id: (data as { id: string }).id,
      action: "created",
      after_value: input,
      reason: input.reason ?? null,
      performed_by: auth.user.id,
    });
    return created(data);
  } catch (err) {
    console.error("[OpsControl] inventory movements POST failed:", err);
    return error("Failed to record inventory movement", 500);
  }
}
