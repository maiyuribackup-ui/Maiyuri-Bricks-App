/**
 * Shared estimate price math — single source of truth for both the
 * authenticated estimator and the public Smart Quote instant estimate.
 *
 * Formula (mirrors apps/web/app/api/leads/[id]/estimates/route.ts):
 *   subtotal  = Σ (product.base_price × quantity)
 *   transport = distance_km > 0 ? max(distance_km × rate, minCharge) : 0
 *   total     = subtotal + transport            (discount handled by caller)
 */

export interface PricedProduct {
  id?: string;
  key?: string;
  name: string;
  unit: string; // "piece" | "sqft" | ...
  base_price: number;
}

export interface EstimateItemInput {
  product: PricedProduct;
  quantity: number;
}

export interface FactorySettingsLike {
  transport_rate_per_km?: number | null;
  min_transport_charge?: number | null;
}

export interface EstimateLine {
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface EstimateBreakdown {
  lineItems: EstimateLine[];
  subtotal: number;
  transport: number;
  total: number;
  /** total ÷ area, when an area is supplied (for a "per sq.ft" headline) */
  perSqft: number | null;
}

export const DEFAULT_TRANSPORT_RATE_PER_KM = 15;
export const DEFAULT_MIN_TRANSPORT_CHARGE = 500;

/** Transport cost for a delivery distance. Single source of truth. */
export function computeTransport(
  distanceKm: number | null | undefined,
  factory: FactorySettingsLike | null | undefined,
): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  const rate = factory?.transport_rate_per_km || DEFAULT_TRANSPORT_RATE_PER_KM;
  const min = factory?.min_transport_charge || DEFAULT_MIN_TRANSPORT_CHARGE;
  return Math.max(distanceKm * rate, min);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeEstimate(
  items: EstimateItemInput[],
  distanceKm: number | null | undefined,
  factory: FactorySettingsLike | null | undefined,
  opts?: { areaSqft?: number | null },
): EstimateBreakdown {
  const lineItems: EstimateLine[] = items.map((it) => ({
    name: it.product.name,
    unit: it.product.unit,
    unitPrice: it.product.base_price,
    quantity: it.quantity,
    total: round2(it.product.base_price * it.quantity),
  }));
  const subtotal = round2(lineItems.reduce((s, l) => s + l.total, 0));
  const transport = round2(computeTransport(distanceKm, factory));
  const total = round2(subtotal + transport);
  const area = opts?.areaSqft;
  const perSqft = area && area > 0 ? round2(total / area) : null;
  return { lineItems, subtotal, transport, total, perSqft };
}
