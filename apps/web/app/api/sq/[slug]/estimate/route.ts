export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import {
  smartQuoteEstimateRequestSchema,
  type SmartQuotePricingConfig,
} from "@maiyuri/shared";
import { computeEstimate } from "@/lib/pricing/compute-estimate";
import { resolveUnitPrice } from "@/lib/pricing";

/**
 * POST /api/sq/[slug]/estimate
 *
 * Public, slug-gated instant estimate for the customer-facing Smart Quote.
 * Computes a real itemized price from the live product catalog + factory
 * transport settings. The slug is the capability — only products the staff
 * marked as `allowed_products` for THIS quote can be priced, and only
 * customer-facing totals are returned (no cost/margin internals).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const parsed = await parseBody(request, smartQuoteEstimateRequestSchema);
    if (parsed.error) return parsed.error;
    const { product_id, quantity, distance_km } = parsed.data;

    // Resolve the quote by slug and read its pricing config
    const { data: quote } = await supabaseAdmin
      .from("smart_quotes")
      .select("id, pricing_config")
      .eq("link_slug", slug)
      .maybeSingle();

    if (!quote) return notFound("Quote not found");

    const pricing = (quote.pricing_config ?? {}) as Partial<SmartQuotePricingConfig>;
    const allowed = pricing.allowed_products ?? [];

    // Only allow pricing products the staff offered on this quote
    if (allowed.length > 0 && !allowed.includes(product_id)) {
      return error("Product not available on this quote", 400);
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, name, unit, base_price, is_active")
      .eq("id", product_id)
      .maybeSingle();

    if (!product || !product.is_active) {
      return error("Product unavailable", 400);
    }

    const { data: factory } = await supabaseAdmin
      .from("factory_settings")
      .select("transport_rate_per_km, min_transport_charge")
      .limit(1)
      .single();

    // Rate card first (GH0/GH3): when a km band covers this distance, the
    // customer sees the true DELIVERED price — no separate transport line,
    // exactly how the business actually quotes. Falls back to the legacy
    // base_price + per-km transport when no band matches.
    const resolved = await resolveUnitPrice(product.id, distance_km ?? null);
    if (resolved && resolved.source === "band") {
      const subtotal = resolved.unit_price * quantity;
      return success({
        product: { id: product.id, name: product.name, unit: product.unit },
        quantity,
        distance_km: distance_km ?? null,
        unit_price: resolved.unit_price,
        subtotal,
        transport_cost: 0,
        transport_included: true,
        total: subtotal,
        pricing_source: "rate_card",
        band: resolved.band,
      });
    }

    const includeTransport = pricing.show_transport !== false;
    const breakdown = computeEstimate(
      [
        {
          product: {
            id: product.id,
            name: product.name,
            unit: product.unit,
            base_price: product.base_price,
          },
          quantity,
        },
      ],
      includeTransport ? (distance_km ?? null) : null,
      factory,
      { areaSqft: product.unit === "sqft" ? quantity : null },
    );

    return success({
      product: { id: product.id, name: product.name, unit: product.unit },
      quantity,
      distance_km: includeTransport ? (distance_km ?? null) : null,
      pricing_source: "base",
      ...breakdown,
    });
  } catch (err) {
    console.error("Smart Quote estimate error:", err);
    return error("Failed to compute estimate", 500);
  }
}
