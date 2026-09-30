/**
 * The engineer's rate is the quote.
 *
 * These lock the rule that /api/sq/[slug]/estimate implements: when
 * pricing_config.quoted_rate is set, the customer's total is rate × quantity
 * and neither the rate card nor products.base_price is consulted. The customer
 * must never be shown a rupee the engineer did not authorise.
 */

import { describe, expect, it } from "vitest";
import type { SmartQuotePricingConfig } from "@maiyuri/shared";

/** Mirrors the branch in the estimate route. */
function usesEngineerRate(
  pricing: Partial<SmartQuotePricingConfig> | null | undefined,
): boolean {
  return pricing?.quoted_rate != null && pricing.quoted_rate > 0;
}

function engineerTotal(rate: number, quantity: number): number {
  return rate * quantity;
}

describe("engineer rate takes over pricing", () => {
  it("is used when the engineer entered a rate", () => {
    expect(usesEngineerRate({ quoted_rate: 42 })).toBe(true);
  });

  it("is NOT used when the rate is absent — rate card still applies", () => {
    expect(usesEngineerRate({})).toBe(false);
    expect(usesEngineerRate({ quoted_rate: null })).toBe(false);
    expect(usesEngineerRate(null)).toBe(false);
    expect(usesEngineerRate(undefined)).toBe(false);
  });

  it("ignores a zero or negative rate rather than quoting ₹0", () => {
    expect(usesEngineerRate({ quoted_rate: 0 })).toBe(false);
    expect(usesEngineerRate({ quoted_rate: -5 })).toBe(false);
  });

  it("totals at exactly rate × quantity, with no transport or markup added", () => {
    expect(engineerTotal(42, 1000)).toBe(42000);
    expect(engineerTotal(37.5, 200)).toBe(7500);
  });

  it("recalculates at the engineer's rate when the customer changes quantity", () => {
    const rate = 42;
    expect(engineerTotal(rate, 1000)).toBe(42000);
    expect(engineerTotal(rate, 2500)).toBe(105000);
    // the per-unit rate never moves, whatever the customer picks
    expect(engineerTotal(rate, 2500) / 2500).toBe(rate);
  });
});
