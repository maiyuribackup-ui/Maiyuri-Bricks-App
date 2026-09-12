export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import {
  requireProductionRole,
  PRODUCTION_WRITE_ROLES,
} from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createOcProductMappingSchema } from "@maiyuri/shared";

// GET /api/ops-control/masters/product-mapping
//
// Returns the existing mappings, the finished goods available to map to, AND
// the unmapped Odoo products that currently carry open demand — the red list
// this screen exists for. Mapping stays purely odoo_product_id ->
// finished_good_id; line classification is the sync's separate responsibility.
export async function GET() {
  try {
    const [mappings, goods, unmappedLines] = await Promise.all([
      supabaseAdmin
        .from("oc_product_mapping")
        .select("*, finished_goods(id, name)")
        .order("odoo_product_id"),
      supabaseAdmin
        .from("finished_goods")
        .select("id, name, odoo_product_id")
        .eq("is_active", true)
        .order("name"),
      supabaseAdmin
        .from("oc_sales_order_lines")
        .select("odoo_product_id, product_name, qty_ordered, qty_delivered")
        .eq("line_kind", "unmapped")
        .eq("source_active", true),
    ]);

    if (mappings.error) return error("Failed to load product mappings", 500);
    if (goods.error) return error("Failed to load finished goods", 500);

    const unmappedAgg = new Map<number, { product_name: string | null; open_qty: number; lines: number }>();
    for (const u of unmappedLines.data ?? []) {
      if (u.odoo_product_id == null) continue;
      const open = Math.max(0, Number(u.qty_ordered) - Number(u.qty_delivered));
      const agg = unmappedAgg.get(u.odoo_product_id as number) ?? {
        product_name: u.product_name as string | null,
        open_qty: 0,
        lines: 0,
      };
      agg.open_qty += open;
      agg.lines += 1;
      unmappedAgg.set(u.odoo_product_id as number, agg);
    }

    return success({
      mappings: mappings.data ?? [],
      finished_goods: goods.data ?? [],
      unmapped: [...unmappedAgg.entries()]
        .map(([odoo_product_id, v]) => ({ odoo_product_id, ...v }))
        .sort((a, b) => b.open_qty - a.open_qty),
    });
  } catch (err) {
    console.error("[OpsControl] product-mapping GET failed:", err);
    return error("Failed to load product mappings", 500);
  }
}

// POST /api/ops-control/masters/product-mapping
//
// Runs the transactional RPC: upsert the mapping AND reclassify existing
// active SO lines for that product in one transaction — map a product and its
// demand appears immediately, no re-sync. Service lines are never promoted
// (service beats mapping); only unmapped/product lines reclassify.
//
// Role note: production_supervisor may map (this is Rajesh's assigned job);
// the OTHER masters (rates, standards, settings) remain founder/owner-only.
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcProductMappingSchema);
    if (parsed.error) return parsed.error;

    const { data, error: rpcError } = await supabaseAdmin.rpc("oc_apply_product_mapping", {
      p_odoo_product_id: parsed.data.odoo_product_id,
      p_odoo_product_name: parsed.data.odoo_product_name ?? null,
      p_finished_good_id: parsed.data.finished_good_id,
      p_user: auth.user.id,
      p_notes: parsed.data.notes ?? null,
    });
    if (rpcError) return error(`Failed to save product mapping: ${rpcError.message}`, 400);

    return success(data);
  } catch (err) {
    console.error("[OpsControl] product-mapping POST failed:", err);
    return error("Failed to save product mapping", 500);
  }
}
