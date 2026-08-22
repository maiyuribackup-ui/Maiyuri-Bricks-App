export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole, PRODUCTION_DELETE_ROLES } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { createOcProductMappingSchema } from "@maiyuri/shared";

// GET /api/ops-control/masters/product-mapping
//
// Returns the mappings alongside the finished goods available to map to.
// Phase 2 adds the unmapped-demand list from oc_sales_order_lines; this route
// is the mapping half of that screen and is deliberately kept pure:
// odoo_product_id -> finished_good_id, nothing else. Line classification
// (product/service/note/unmapped) is a separate responsibility that reads
// Odoo's own display_type and product type during the sales-order sync.
export async function GET() {
  try {
    const [mappings, goods] = await Promise.all([
      supabaseAdmin
        .from("oc_product_mapping")
        .select("*, finished_goods(id, name)")
        .order("odoo_product_id"),
      supabaseAdmin
        .from("finished_goods")
        .select("id, name, odoo_product_id")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (mappings.error) return error("Failed to load product mappings", 500);
    if (goods.error) return error("Failed to load finished goods", 500);

    return success({
      mappings: mappings.data ?? [],
      finished_goods: goods.data ?? [],
    });
  } catch (err) {
    console.error("[OpsControl] product-mapping GET failed:", err);
    return error("Failed to load product mappings", 500);
  }
}

// POST /api/ops-control/masters/product-mapping
//
// Mapping an Odoo product makes its open demand visible to planning. This
// matters concretely: brick SKUs with real open orders currently carry no
// product link and are therefore invisible in the plan.
//
// Upsert on odoo_product_id — re-pointing a product at a different finished
// good is a correction, not a duplicate, and is audited with the before value.
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcProductMappingSchema);
    if (parsed.error) return parsed.error;

    const { data: before } = await supabaseAdmin
      .from("oc_product_mapping")
      .select("*")
      .eq("odoo_product_id", parsed.data.odoo_product_id)
      .maybeSingle();

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_product_mapping")
      .upsert(
        {
          ...parsed.data,
          mapped_by: auth.user.id,
          mapped_at: new Date().toISOString(),
        },
        { onConflict: "odoo_product_id" },
      )
      .select("*, finished_goods(id, name)")
      .single();

    if (dbError) {
      return error(`Failed to save product mapping: ${dbError.message}`, 400);
    }

    await logOcAudit({
      entity: "oc_product_mapping",
      entity_id: (data as { id: string }).id,
      action: before ? "updated" : "created",
      before_value: before ?? null,
      after_value: parsed.data,
      performed_by: auth.user.id,
    });

    return success(data);
  } catch (err) {
    console.error("[OpsControl] product-mapping POST failed:", err);
    return error("Failed to save product mapping", 500);
  }
}
