/**
 * Builds the default Smart Quote pricing_config from a lead's product interests
 * + the live product catalog. Staff can tweak it in the review step before
 * sharing. Maps the lead's ProductInterest values onto real `products` rows.
 */

import type { SmartQuotePricingConfig } from "@maiyuri/shared";

export interface ProductRow {
  id: string;
  name: string;
  category: string; // "cement_interlock" | "mud_interlock" | "project"
  size: string | null; // "6_inch" | "8_inch" | null
  unit: string; // "piece" | "sqft"
  base_price: number;
  is_active: boolean;
}

// ProductInterest enum value -> predicate over a product row
function interestMatcher(interest: string): (p: ProductRow) => boolean {
  switch (interest) {
    case "8_inch_mud_interlock":
      return (p) => p.category === "mud_interlock" && p.size === "8_inch";
    case "6_inch_mud_interlock":
      return (p) => p.category === "mud_interlock" && p.size === "6_inch";
    case "8_inch_cement_interlock":
      return (p) => p.category === "cement_interlock" && p.size === "8_inch";
    case "6_inch_cement_interlock":
      return (p) => p.category === "cement_interlock" && p.size === "6_inch";
    case "residential_project":
      return (p) => p.category === "project" && /residential/i.test(p.name);
    case "compound_wall_project":
      return (p) => p.category === "project" && /compound/i.test(p.name);
    case "laying_services":
      return (p) => p.category === "project" && /laying/i.test(p.name);
    default:
      return () => false;
  }
}

const SQFT_DEFAULT = 1000; // typical project area
const PIECE_DEFAULT = 2000; // typical brick order

export function buildPricingConfig(opts: {
  products: ProductRow[];
  interests: string[] | null | undefined;
  siteLocation: string | null | undefined;
  repPhone: string | null | undefined;
}): SmartQuotePricingConfig {
  const active = opts.products.filter((p) => p.is_active);

  // Resolve the lead's interests to product ids; fall back to all active.
  const matched: ProductRow[] = [];
  for (const interest of opts.interests ?? []) {
    const match = active.find(interestMatcher(interest));
    if (match && !matched.some((m) => m.id === match.id)) matched.push(match);
  }
  const offered = matched.length > 0 ? matched : active;
  const defaultProduct = offered[0] ?? null;

  return {
    allowed_products: offered.map((p) => p.id),
    default_product: defaultProduct?.id ?? null,
    default_area_sqft: defaultProduct
      ? defaultProduct.unit === "sqft"
        ? SQFT_DEFAULT
        : PIECE_DEFAULT
      : null,
    default_distance_km: null,
    locality_label: opts.siteLocation ?? null,
    show_transport: true,
    price_note: null,
    rep_phone: opts.repPhone ?? null,
  };
}
