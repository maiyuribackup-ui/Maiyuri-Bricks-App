import { describe, it, expect } from "vitest";
import {
  isEffectiveOn,
  resolveEffective,
  resolveRate,
  resolveConsumptionStandard,
  resolveVehicleCapacity,
  calculateLabourAmount,
  type ActivityRate,
  type ConsumptionStandard,
  type VehicleCapacity,
} from "./rates";

const FG_8 = "11111111-1111-1111-1111-111111111111";
const FG_6 = "22222222-2222-2222-2222-222222222222";
const VEHICLE = "33333333-3333-3333-3333-333333333333";

function rate(over: Partial<ActivityRate> & { id: string }): ActivityRate {
  return {
    finished_good_id: FG_8,
    activity_code: "production",
    rate: 7,
    uom: "per_brick",
    effective_from: "2026-01-01",
    effective_to: null,
    active: true,
    ...over,
  };
}

describe("isEffectiveOn", () => {
  const row = rate({ id: "r1", effective_from: "2026-01-01", effective_to: "2026-08-31" });

  it("includes both ends of the period", () => {
    expect(isEffectiveOn(row, "2026-01-01")).toBe(true);
    expect(isEffectiveOn(row, "2026-08-31")).toBe(true);
  });

  it("excludes dates outside the period", () => {
    expect(isEffectiveOn(row, "2025-12-31")).toBe(false);
    expect(isEffectiveOn(row, "2026-09-01")).toBe(false);
  });

  it("treats a null effective_to as still in force", () => {
    const open = rate({ id: "r2", effective_from: "2026-09-01", effective_to: null });
    expect(isEffectiveOn(open, "2030-01-01")).toBe(true);
  });

  it("ignores inactive rows so a superseded rate never applies", () => {
    expect(isEffectiveOn({ ...row, active: false }, "2026-05-01")).toBe(false);
  });
});

describe("resolveRate — PRD §60 effective dating", () => {
  // The PRD's worked example: Rs.7 until 31 Aug, Rs.7.50 from 1 Sep.
  const rates = [
    rate({ id: "aug", rate: 7, effective_from: "2026-01-01", effective_to: "2026-08-31" }),
    rate({ id: "sep", rate: 7.5, effective_from: "2026-09-01", effective_to: null }),
  ];

  it("an August record still uses Rs.7 after the September rate exists", () => {
    expect(resolveRate(rates, FG_8, "production", "2026-08-15")?.rate).toBe(7);
  });

  it("resolves the boundary day 31 Aug to the old rate", () => {
    expect(resolveRate(rates, FG_8, "production", "2026-08-31")?.rate).toBe(7);
  });

  it("resolves 1 Sep to the new rate", () => {
    expect(resolveRate(rates, FG_8, "production", "2026-09-01")?.rate).toBe(7.5);
  });

  it("returns the snapshot needed to reproduce the calculation", () => {
    expect(resolveRate(rates, FG_8, "production", "2026-08-15")).toEqual({
      rate: 7,
      rate_id: "aug",
      rate_effective_from: "2026-01-01",
      uom: "per_brick",
    });
  });

  it("does not leak another product's rate", () => {
    expect(resolveRate(rates, FG_6, "production", "2026-08-15")).toBeNull();
  });

  it("does not leak another activity's rate", () => {
    expect(resolveRate(rates, FG_8, "loading", "2026-08-15")).toBeNull();
  });

  it("returns null when nothing is configured rather than defaulting to zero", () => {
    // A silent zero would understate wages owed, so the caller must handle null.
    expect(resolveRate([], FG_8, "production", "2026-08-15")).toBeNull();
    expect(resolveRate(rates, FG_8, "production", "2025-06-01")).toBeNull();
  });

  it("prefers the later start if periods ever overlap", () => {
    // The DB prevents this; the tie-break is defensive.
    const overlapping = [
      rate({ id: "old", rate: 7, effective_from: "2026-01-01", effective_to: "2026-12-31" }),
      rate({ id: "new", rate: 9, effective_from: "2026-06-01", effective_to: "2026-12-31" }),
    ];
    expect(resolveRate(overlapping, FG_8, "production", "2026-08-15")?.rate).toBe(9);
  });
});

describe("resolveEffective", () => {
  it("returns null when no row matches", () => {
    expect(resolveEffective([], "2026-08-15")).toBeNull();
  });
});

describe("resolveConsumptionStandard", () => {
  const standards: ConsumptionStandard[] = [
    {
      id: "s1",
      finished_good_id: FG_8,
      material: "cement",
      standard_yield: 140,
      tolerance_pct: 5,
      effective_from: "2026-08-01",
      effective_to: "2026-08-31",
      active: true,
    },
    {
      id: "s2",
      finished_good_id: FG_8,
      material: "cement",
      standard_yield: 145,
      tolerance_pct: 5,
      effective_from: "2026-09-01",
      effective_to: null,
      active: true,
    },
  ];

  it("an August production record evaluates against August's recipe", () => {
    expect(
      resolveConsumptionStandard(standards, FG_8, "cement", "2026-08-20")?.standard_yield,
    ).toBe(140);
  });

  it("September uses the new recipe", () => {
    expect(
      resolveConsumptionStandard(standards, FG_8, "cement", "2026-09-20")?.standard_yield,
    ).toBe(145);
  });

  it("does not match a different material", () => {
    expect(resolveConsumptionStandard(standards, FG_8, "sand", "2026-08-20")).toBeNull();
  });
});

describe("resolveVehicleCapacity", () => {
  const capacities: VehicleCapacity[] = [
    {
      id: "c8",
      vehicle_id: VEHICLE,
      finished_good_id: FG_8,
      full_load_qty: 900,
      effective_from: "2026-01-01",
      effective_to: null,
      active: true,
    },
    {
      id: "c6",
      vehicle_id: VEHICLE,
      finished_good_id: FG_6,
      full_load_qty: 1000,
      effective_from: "2026-01-01",
      effective_to: null,
      active: true,
    },
  ];

  // PRD AC-T04 / AC-T05
  it('resolves 8" capacity to 900', () => {
    expect(resolveVehicleCapacity(capacities, VEHICLE, FG_8, "2026-08-22")?.full_load_qty).toBe(900);
  });

  it('resolves 6" capacity to 1000', () => {
    expect(resolveVehicleCapacity(capacities, VEHICLE, FG_6, "2026-08-22")?.full_load_qty).toBe(1000);
  });

  it("returns null for an unconfigured product, rather than guessing", () => {
    // Solid Blocks are deliberately unseeded — loading them must prompt config.
    expect(resolveVehicleCapacity(capacities, VEHICLE, "unknown-fg", "2026-08-22")).toBeNull();
  });
});

describe("calculateLabourAmount", () => {
  const snapshot = { rate: 7, rate_id: "aug", rate_effective_from: "2026-01-01", uom: "per_brick" };

  it("multiplies eligible quantity by the snapshotted rate", () => {
    expect(calculateLabourAmount(1200, snapshot)).toBe(8400);
  });

  it("rounds to paise", () => {
    expect(calculateLabourAmount(333, { ...snapshot, rate: 7.005 })).toBe(2332.67);
  });

  it("handles a zero quantity", () => {
    expect(calculateLabourAmount(0, snapshot)).toBe(0);
  });
});
