import { describe, it, expect } from "vitest";
import type { WallCostConfig } from "@maiyuri/shared";
import {
  sumLineItems,
  isEmptyConfig,
  mergeWallCosts,
  computeWallComparison,
  PLACEHOLDER_WALL_COST_CONFIG,
} from "./wall-cost";

const cfg: WallCostConfig = {
  interlock: { masonry_units: 50, mortar_cement: 10, plastering: 0, labour: 20 }, // 80
  red_brick: { masonry_units: 45, mortar_cement: 20, plastering: 35, labour: 40 }, // 140
  aac: { masonry_units: 60, mortar_cement: 15, plastering: 30, labour: 25 }, // 130
};

describe("sumLineItems", () => {
  it("sums the four line items", () => {
    expect(sumLineItems(cfg.interlock)).toBe(80);
    expect(sumLineItems(cfg.red_brick)).toBe(140);
  });
});

describe("isEmptyConfig", () => {
  it("treats null/all-zero as empty", () => {
    expect(isEmptyConfig(null)).toBe(true);
    expect(
      isEmptyConfig({
        interlock: { masonry_units: 0, mortar_cement: 0, plastering: 0, labour: 0 },
        red_brick: { masonry_units: 0, mortar_cement: 0, plastering: 0, labour: 0 },
        aac: { masonry_units: 0, mortar_cement: 0, plastering: 0, labour: 0 },
      }),
    ).toBe(true);
    expect(isEmptyConfig(cfg)).toBe(false);
  });
});

describe("computeWallComparison", () => {
  it("returns null when area is missing or non-positive", () => {
    expect(computeWallComparison(cfg, 0)).toBeNull();
    expect(computeWallComparison(cfg, null)).toBeNull();
    expect(computeWallComparison(cfg, -5)).toBeNull();
  });

  it("returns null when config is empty", () => {
    expect(computeWallComparison(null, 1000)).toBeNull();
  });

  it("computes per-sqft, build totals and deltas vs interlock", () => {
    const r = computeWallComparison(cfg, 1000)!;
    expect(r).not.toBeNull();
    expect(r.areaSqft).toBe(1000);

    const interlock = r.systems.find((s) => s.system === "interlock")!;
    const red = r.systems.find((s) => s.system === "red_brick")!;
    const aac = r.systems.find((s) => s.system === "aac")!;

    expect(interlock.perSqft).toBe(80);
    expect(interlock.buildTotal).toBe(80_000);
    expect(interlock.deltaRupeesVsInterlock).toBe(0);
    expect(interlock.deltaPctVsInterlock).toBe(0);

    expect(red.perSqft).toBe(140);
    expect(red.buildTotal).toBe(140_000);
    expect(red.deltaRupeesVsInterlock).toBe(60_000);
    expect(red.deltaPctVsInterlock).toBe(75); // (140-80)/80 = 75%

    expect(aac.deltaPctVsInterlock).toBe(63); // (130-80)/80 = 62.5 → 63
    expect(r.interlockIsCheapest).toBe(true);
  });

  it("flags when interlock is NOT the cheapest (misconfig guard)", () => {
    const flipped: WallCostConfig = {
      ...cfg,
      interlock: { masonry_units: 200, mortar_cement: 0, plastering: 0, labour: 0 },
    };
    const r = computeWallComparison(flipped, 500)!;
    expect(r.interlockIsCheapest).toBe(false);
  });
});

describe("mergeWallCosts", () => {
  it("deep-merges a partial per-cell override over the global template", () => {
    const merged = mergeWallCosts(cfg, {
      red_brick: { plastering: 50 } as never,
    });
    // overridden cell wins
    expect(merged.red_brick.plastering).toBe(50);
    // siblings preserved from global
    expect(merged.red_brick.masonry_units).toBe(45);
    // untouched systems preserved
    expect(merged.interlock.labour).toBe(20);
  });

  it("falls back to the placeholder when no global is provided", () => {
    const merged = mergeWallCosts(null, null);
    expect(merged.interlock).toEqual(PLACEHOLDER_WALL_COST_CONFIG.interlock);
  });
});
