import { describe, it, expect } from "vitest";
import {
  tripUtilisation,
  utilisationBand,
  tripWarnings,
  reconcileDelivery,
} from "./trip-capacity";
import type { VehicleCapacity } from "./rates";

const SIX = "fg-6in";
const EIGHT = "fg-8in";
const VEHICLE = "veh-1";

const cap = (fg: string, full: number, over: Partial<VehicleCapacity> = {}): VehicleCapacity => ({
  id: `cap-${fg}`,
  vehicle_id: VEHICLE,
  finished_good_id: fg,
  full_load_qty: full,
  effective_from: "2026-01-01",
  effective_to: null,
  active: true,
  ...over,
});

// 6" = 1000 per load, 8" = 900 per load — the seeded production values.
const CAPS = [cap(SIX, 1000), cap(EIGHT, 900)];
const T = { greenMinPct: 95, yellowMinPct: 80, redAbovePct: 100 };
const util = (items: { finished_good_id: string; quantity: number }[]) =>
  tripUtilisation({
    items,
    capacities: CAPS,
    vehicleId: VEHICLE,
    onDate: "2026-08-30",
    thresholds: T,
  });

describe("tripUtilisation — PRD §41, capacity is per product", () => {
  it("the PRD case: 500 6-inch + 450 8-inch is exactly one full load", () => {
    // 500/1000 + 450/900 = 0.5 + 0.5. Counting bricks would say 950 and be
    // meaningless, because the two products do not share a unit of capacity.
    const r = util([
      { finished_good_id: SIX, quantity: 500 },
      { finished_good_id: EIGHT, quantity: 450 },
    ]);
    expect(r.pct).toBeCloseTo(100, 6);
    expect(r.band).toBe("green");
  });

  it("the PRD case: 600 + 450 is 110% and bands red", () => {
    const r = util([
      { finished_good_id: SIX, quantity: 600 },
      { finished_good_id: EIGHT, quantity: 450 },
    ]);
    expect(r.pct).toBeCloseTo(110, 6);
    expect(r.band).toBe("red_over");
  });

  it("a single-product full load is 100%", () => {
    expect(util([{ finished_good_id: EIGHT, quantity: 900 }]).pct).toBe(100);
  });

  it("an unconfigured product degrades the whole result rather than counting as zero", () => {
    // Treating it as zero would let a genuinely over-loaded vehicle read
    // green — the most dangerous possible failure for this number.
    const r = util([
      { finished_good_id: EIGHT, quantity: 900 },
      { finished_good_id: "fg-unknown", quantity: 500 },
    ]);
    expect(r.pct).toBeNull();
    expect(r.band).toBe("not_evaluated");
    expect(r.unpricedProducts).toEqual(["fg-unknown"]);
  });

  it("ignores zero-quantity items", () => {
    const r = util([
      { finished_good_id: EIGHT, quantity: 900 },
      { finished_good_id: SIX, quantity: 0 },
    ]);
    expect(r.pct).toBe(100);
  });

  it("uses the capacity in force on the trip date", () => {
    const capacities = [
      cap(EIGHT, 900, { id: "aug", effective_from: "2026-01-01", effective_to: "2026-08-31" }),
      cap(EIGHT, 1200, { id: "sep", effective_from: "2026-09-01" }),
    ];
    const august = tripUtilisation({
      items: [{ finished_good_id: EIGHT, quantity: 900 }],
      capacities, vehicleId: VEHICLE, onDate: "2026-08-30", thresholds: T,
    });
    const september = tripUtilisation({
      items: [{ finished_good_id: EIGHT, quantity: 900 }],
      capacities, vehicleId: VEHICLE, onDate: "2026-09-02", thresholds: T,
    });
    expect(august.pct).toBe(100);
    expect(september.pct).toBe(75);
  });
});

describe("utilisationBand", () => {
  it("bands both ends as problems", () => {
    expect(utilisationBand(101, T)).toBe("red_over");
    expect(utilisationBand(100, T)).toBe("green");
    expect(utilisationBand(95, T)).toBe("green");
    expect(utilisationBand(94, T)).toBe("amber");
    expect(utilisationBand(80, T)).toBe("amber");
    expect(utilisationBand(79, T)).toBe("red_under");
  });
});

describe("tripWarnings — §72/§73, warnings warn and never block", () => {
  it("flags an over-capacity load", () => {
    const w = tripWarnings({
      utilisation: util([
        { finished_good_id: SIX, quantity: 600 },
        { finished_good_id: EIGHT, quantity: 450 },
      ]),
      tripNo: 1,
      normalMaxTripsPerDay: 2,
    });
    expect(w.map((x) => x.code)).toContain("over_capacity");
    // Every warning is advisory — nothing here can refuse a save.
    expect(w.every((x) => x.severity === "warning" || x.severity === "info")).toBe(true);
  });

  it("flags a third trip beyond the normal two", () => {
    const w = tripWarnings({
      utilisation: util([{ finished_good_id: EIGHT, quantity: 900 }]),
      tripNo: 3,
      normalMaxTripsPerDay: 2,
    });
    expect(w.map((x) => x.code)).toEqual(["extra_trip"]);
  });

  it("is silent on a well-loaded, normal trip", () => {
    expect(
      tripWarnings({
        utilisation: util([{ finished_good_id: EIGHT, quantity: 900 }]),
        tripNo: 2,
        normalMaxTripsPerDay: 2,
      }),
    ).toEqual([]);
  });

  it("names the product whose capacity is missing", () => {
    const w = tripWarnings({
      utilisation: util([{ finished_good_id: "fg-unknown", quantity: 100 }]),
      tripNo: 1,
      normalMaxTripsPerDay: 2,
      productNames: { "fg-unknown": "Solid Block" },
    });
    expect(w[0].code).toBe("capacity_unknown");
    expect(w[0].message).toContain("Solid Block");
  });
});

describe("reconcileDelivery — PRD §7, two different facts", () => {
  it("the worked example: loaded 900, accepted 850, returned 20, damaged 30", () => {
    const r = reconcileDelivery({
      loaded: 900, unloaded: 850, returned: 20, damaged: 30, lostOrShort: 0,
    });
    expect(r.balanced).toBe(true);
    // Inventory fell by what left less what came back. The 30 damaged are
    // gone — restoring them would put broken bricks back on the shelf.
    expect(r.netInventoryImpact).toBe(-880);
    // The customer got 850. That is what drives SO fulfilment, and it is NOT
    // the same number as the inventory movement.
    expect(r.customerFulfilment).toBe(850);
  });

  it("the §7 blocking case: 30 bricks unexplained", () => {
    const r = reconcileDelivery({
      loaded: 900, unloaded: 820, returned: 20, damaged: 30, lostOrShort: 0,
    });
    expect(r.accounted).toBe(870);
    expect(r.unexplained).toBe(30);
    expect(r.balanced).toBe(false);
  });

  it("classifying the remainder as short balances it", () => {
    const r = reconcileDelivery({
      loaded: 900, unloaded: 820, returned: 20, damaged: 30, lostOrShort: 30,
    });
    expect(r.balanced).toBe(true);
    expect(r.unexplained).toBe(0);
    // Short stock left and did not come back, exactly like damaged stock.
    expect(r.netInventoryImpact).toBe(-880);
    expect(r.customerFulfilment).toBe(820);
  });

  it("a clean delivery moves inventory by exactly what was delivered", () => {
    const r = reconcileDelivery({
      loaded: 900, unloaded: 900, returned: 0, damaged: 0, lostOrShort: 0,
    });
    expect(r.balanced).toBe(true);
    expect(r.netInventoryImpact).toBe(-900);
    expect(r.customerFulfilment).toBe(900);
  });

  it("a fully refused load returns everything to stock", () => {
    const r = reconcileDelivery({
      loaded: 900, unloaded: 0, returned: 900, damaged: 0, lostOrShort: 0,
    });
    expect(r.balanced).toBe(true);
    expect(r.netInventoryImpact).toBe(0);
    expect(r.customerFulfilment).toBe(0);
  });

  it("over-accounting is caught as a negative remainder", () => {
    const r = reconcileDelivery({
      loaded: 900, unloaded: 900, returned: 50, damaged: 0, lostOrShort: 0,
    });
    expect(r.unexplained).toBe(-50);
    expect(r.balanced).toBe(false);
  });
});
