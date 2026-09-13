/**
 * Rate-card pricing (Golden Hour GH0).
 *
 * The business sells DELIVERED: one price per product per distance band
 * (e.g. CIB 8" · 0-20km → ₹18/pc · 20-50km → ₹19.50/pc). Bands live in
 * rate_card_entries, managed by leadership on the web Rate Card page.
 *
 * resolveUnitPrice() is the single source of truth used by the auto-quote
 * and the AI pre-call brief. Fallback when no band covers the distance:
 * products.base_price (+ a flag so callers can say "price on request").
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

export type RateCardEntry = {
  id: string;
  product_id: string;
  km_from: number;
  km_to: number;
  unit_price: number;
  is_active: boolean;
};

export type ResolvedPrice = {
  product_id: string;
  product_name: string;
  unit: string;
  unit_price: number;
  /** "band" = matched a rate-card band; "base" = fell back to base_price. */
  source: "band" | "base";
  band?: { km_from: number; km_to: number };
};

/** All active bands for all active products (one query, for editors/briefs). */
export async function getRateCard(): Promise<{
  products: { id: string; name: string; unit: string; base_price: number }[];
  entries: RateCardEntry[];
}> {
  const [{ data: products }, { data: entries }] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, unit, base_price")
      .eq("is_active", true)
      .order("name"),
    supabaseAdmin
      .from("rate_card_entries")
      .select("id, product_id, km_from, km_to, unit_price, is_active")
      .eq("is_active", true)
      .order("km_from"),
  ]);
  return {
    products: (products ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      unit: p.unit as string,
      base_price: num(p.base_price),
    })),
    entries: (entries ?? []).map((e) => ({
      id: e.id as string,
      product_id: e.product_id as string,
      km_from: num(e.km_from),
      km_to: num(e.km_to),
      unit_price: num(e.unit_price),
      is_active: !!e.is_active,
    })),
  };
}

/**
 * Delivered unit price for one product at a distance. Band match is
 * inclusive-from / exclusive-to (0-20 covers 0..19.9; 20-50 starts at 20).
 */
export async function resolveUnitPrice(
  productId: string,
  distanceKm: number | null,
): Promise<ResolvedPrice | null> {
  const { products, entries } = await getRateCard();
  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  if (distanceKm != null && Number.isFinite(distanceKm)) {
    const band = entries.find(
      (e) =>
        e.product_id === productId &&
        distanceKm >= e.km_from &&
        distanceKm < e.km_to,
    );
    if (band) {
      return {
        product_id: product.id,
        product_name: product.name,
        unit: product.unit,
        unit_price: band.unit_price,
        source: "band",
        band: { km_from: band.km_from, km_to: band.km_to },
      };
    }
  }

  return {
    product_id: product.id,
    product_name: product.name,
    unit: product.unit,
    unit_price: product.base_price,
    source: "base",
  };
}
