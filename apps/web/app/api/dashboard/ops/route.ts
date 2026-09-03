export const dynamic = "force-dynamic";
export const maxDuration = 60; // live Odoo round-trips (stock + balances)

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooExecute } from "@/lib/odoo-service";
import { balancesFromOdoo } from "@/lib/ceo/briefing";

/**
 * GET /api/dashboard/ops — the Ops Home snapshot for factory/accounts roles:
 *   • finished-good stock (mirrored from Odoo into finished_goods by the sync)
 *   • cement on hand, live from Odoo (kg → 50kg bags)
 *   • bank & cash balances, live from Odoo posted journal entries
 *
 * Balances are sensitive — restrict to the roles that run money/production.
 * Every Odoo call is best-effort: a slow/unreachable ERP degrades a tile to
 * null instead of failing the whole home screen.
 */
const OPS_HOME_ROLES = ["production_supervisor", "accountant", "founder", "owner"];

const CEMENT_KG_PER_BAG = 50;

async function cementFromOdoo(): Promise<{
  kg: number;
  bags: number;
} | null> {
  const { data: cement } = await supabaseAdmin
    .from("raw_materials")
    .select("odoo_product_id")
    .ilike("name", "%cement%")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!cement?.odoo_product_id) return null;

  const products = (await odooExecute(
    "product.product",
    "read",
    [[cement.odoo_product_id]],
    { fields: ["qty_available"] },
  )) as { qty_available: number }[];
  const kg = Number(products?.[0]?.qty_available ?? 0);
  return { kg, bags: Math.floor(kg / CEMENT_KG_PER_BAG) };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!OPS_HOME_ROLES.includes(user.role)) {
      return error("Not permitted", 403);
    }

    const [stockRes, cementRes, balancesRes] = await Promise.allSettled([
      supabaseAdmin
        .from("finished_goods")
        .select("name, stock_qty, stock_synced_at")
        .eq("is_active", true)
        .eq("plan_excluded", false)
        .order("stock_qty", { ascending: false }),
      cementFromOdoo(),
      balancesFromOdoo(),
    ]);

    const stockRows =
      stockRes.status === "fulfilled" ? (stockRes.value.data ?? []) : [];
    if (cementRes.status === "rejected") {
      console.error("[OpsHome] cement pull failed:", cementRes.reason);
    }
    if (balancesRes.status === "rejected") {
      console.error("[OpsHome] balances pull failed:", balancesRes.reason);
    }

    return success({
      stock: stockRows.map((r) => ({
        name: (r.name as string).trim(),
        qty: Number(r.stock_qty ?? 0),
      })),
      stock_synced_at: (stockRows[0]?.stock_synced_at as string) ?? null,
      cement: cementRes.status === "fulfilled" ? cementRes.value : null,
      balances: balancesRes.status === "fulfilled" ? balancesRes.value : null,
      as_of: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[OpsHome] failed:", err);
    return error("Failed to load ops snapshot", 500);
  }
}
