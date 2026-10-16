import { describe, it, expect } from "vitest";
import { isValidBagQuantity, OC_SETTINGS_FALLBACK } from "./settings";

describe("isValidBagQuantity — PRD §32 / AC-C01", () => {
  it("accepts the PRD's worked examples at a 0.5 step", () => {
    // "Valid examples: 3, 3.5, 4, 4.5"
    for (const bags of [3, 3.5, 4, 4.5]) {
      expect(isValidBagQuantity(bags, 0.5)).toBe(true);
    }
  });

  it("rejects quantities off the step", () => {
    expect(isValidBagQuantity(4.3, 0.5)).toBe(false);
    expect(isValidBagQuantity(0.25, 0.5)).toBe(false);
  });

  it("accepts zero", () => {
    expect(isValidBagQuantity(0, 0.5)).toBe(true);
  });

  it("rejects negatives — that is a data-integrity failure (PRD §88)", () => {
    expect(isValidBagQuantity(-0.5, 0.5)).toBe(false);
  });

  it("honours a reconfigured step rather than assuming 0.5", () => {
    expect(isValidBagQuantity(4.25, 0.25)).toBe(true);
    expect(isValidBagQuantity(4.25, 0.5)).toBe(false);
    expect(isValidBagQuantity(4, 1)).toBe(true);
    expect(isValidBagQuantity(4.5, 1)).toBe(false);
  });

  it("does not trip over floating-point representation", () => {
    // 4.5 / 0.1 is 44.999... in IEEE754; integer scaling avoids a false reject.
    expect(isValidBagQuantity(4.5, 0.1)).toBe(true);
    expect(isValidBagQuantity(0.3, 0.1)).toBe(true);
  });

  it("rejects a nonsensical step instead of dividing by zero", () => {
    expect(isValidBagQuantity(4, 0)).toBe(false);
    expect(isValidBagQuantity(4, -0.5)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidBagQuantity(Number.NaN, 0.5)).toBe(false);
  });
});

describe("OC_SETTINGS_FALLBACK — PRD §100 seeded defaults", () => {
  it("matches the PRD's current operating defaults", () => {
    expect(OC_SETTINGS_FALLBACK.default_shifts_per_day).toBe(2);
    expect(OC_SETTINGS_FALLBACK.normal_max_trips_per_day).toBe(2);
    expect(OC_SETTINGS_FALLBACK.cement_bag_kg).toBe(50);
    expect(OC_SETTINGS_FALLBACK.cement_bag_step).toBe(0.5);
  });

  it("carries no labour rate or cement ratio — those must be configured", () => {
    // AC-L02: no Rs.7/Rs.6 anywhere. A fallback rate would defeat the master.
    const keys = Object.keys(OC_SETTINGS_FALLBACK);
    expect(keys.some((k) => k.includes("rate"))).toBe(false);
    expect(keys.some((k) => k.includes("yield"))).toBe(false);
  });
});
