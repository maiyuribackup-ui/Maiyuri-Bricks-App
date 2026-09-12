/**
 * Is a Smart Quote safe to send to a customer?
 *
 * A quote with no engineer rate silently falls back to the rate card, which is
 * exactly what the business asked us to stop doing — the customer would see a
 * price nobody authorised. Sharing is blocked until an engineer sets one.
 */

import type { SmartQuotePricingConfig } from "@maiyuri/shared";

export interface QuoteReadiness {
  /** Safe to copy/send the public link. */
  ready: boolean;
  /** Why not, for the staff UI. Null when ready. */
  reason: string | null;
}

export function getQuoteReadiness(
  pricing: Partial<SmartQuotePricingConfig> | null | undefined,
): QuoteReadiness {
  // Multi-product quotes are judged line by line. The same rule applies to
  // each: a line the engineer has not priced cannot go to a customer, and a
  // half-priced quote is worse than an unpriced one because the total looks
  // authoritative.
  const items = pricing?.items;
  if (items && items.length > 0) {
    for (const [i, item] of items.entries()) {
      const label = `Line ${i + 1}`;
      if (!item.product_id) {
        return { ready: false, reason: `${label}: choose the product being quoted.` };
      }
      if (item.rate == null || !(item.rate > 0)) {
        return {
          ready: false,
          reason: `${label}: set the rate before sharing — without it the customer sees rate-card pricing, not yours.`,
        };
      }
      if (item.quantity == null || !(item.quantity > 0)) {
        return { ready: false, reason: `${label}: enter the quantity being quoted.` };
      }
    }
    return { ready: true, reason: null };
  }

  const rate = pricing?.quoted_rate;
  if (rate == null) {
    return {
      ready: false,
      reason:
        "Set the rate before sharing — without it the customer sees rate-card pricing, not yours.",
    };
  }
  if (!(rate > 0)) {
    return {
      ready: false,
      reason: "Rate must be greater than ₹0.",
    };
  }
  if (!pricing?.default_product) {
    return {
      ready: false,
      reason: "Choose the product being quoted before sharing.",
    };
  }
  const quantity = pricing?.default_area_sqft;
  if (quantity == null || !(quantity > 0)) {
    return {
      ready: false,
      reason: "Enter the quantity being quoted before sharing.",
    };
  }
  return { ready: true, reason: null };
}
