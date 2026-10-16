import { describe, expect, it } from "vitest";
import { getQuoteReadiness } from "./quote-readiness";

const complete = {
  quoted_rate: 42,
  default_product: "11111111-1111-1111-1111-111111111111",
  default_area_sqft: 1000,
};

describe("getQuoteReadiness", () => {
  it("is ready when product, quantity and rate are all set", () => {
    const result = getQuoteReadiness(complete);
    expect(result.ready).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("blocks sharing when the engineer has not set a rate", () => {
    for (const pricing of [null, undefined, {}, { ...complete, quoted_rate: null }]) {
      const result = getQuoteReadiness(pricing);
      expect(result.ready).toBe(false);
      expect(result.reason).toMatch(/rate/i);
    }
  });

  it("blocks a zero or negative rate rather than quoting ₹0", () => {
    expect(getQuoteReadiness({ ...complete, quoted_rate: 0 }).ready).toBe(false);
    expect(getQuoteReadiness({ ...complete, quoted_rate: -1 }).ready).toBe(false);
  });

  it("blocks when the product is missing", () => {
    const result = getQuoteReadiness({ ...complete, default_product: null });
    expect(result.ready).toBe(false);
    expect(result.reason).toMatch(/product/i);
  });

  it("blocks when the quantity is missing or not positive", () => {
    expect(getQuoteReadiness({ ...complete, default_area_sqft: null }).ready).toBe(false);
    expect(getQuoteReadiness({ ...complete, default_area_sqft: 0 }).ready).toBe(false);
    expect(
      getQuoteReadiness({ ...complete, default_area_sqft: null }).reason,
    ).toMatch(/quantity/i);
  });

  it("reports the missing rate first — it is the reason the guard exists", () => {
    const result = getQuoteReadiness({
      quoted_rate: null,
      default_product: null,
      default_area_sqft: null,
    });
    expect(result.reason).toMatch(/rate/i);
  });
});
