import { describe, it, expect } from "vitest";
import {
  buildShiftInputs,
  calculateExpectedConsumption,
  calculateConsumptionDifference,
  type ShiftFormRecord,
} from "./useProduction";
import type { BOMLine } from "@maiyuri/shared";

const bomLines = [
  {
    id: "line-1",
    finished_good_id: "fg-1",
    raw_material_id: "rm-cement",
    odoo_bom_line_id: 1,
    quantity_per_bom: 50,
    uom_name: "kg",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "line-2",
    finished_good_id: "fg-1",
    raw_material_id: "rm-soil",
    odoo_bom_line_id: 2,
    quantity_per_bom: 200,
    uom_name: "kg",
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
  },
] as unknown as BOMLine[];

describe("calculateExpectedConsumption", () => {
  it("scales BOM line quantities by planned/bom ratio", () => {
    // BOM produces 1000 bricks; planning 2000 → multiplier 2
    const result = calculateExpectedConsumption(2000, 1000, bomLines);

    expect(result).toHaveLength(2);
    expect(result[0].expected_quantity).toBe(100);
    expect(result[1].expected_quantity).toBe(400);
  });

  it("returns empty array when bomQuantity is 0 (no divide-by-zero)", () => {
    expect(calculateExpectedConsumption(2000, 0, bomLines)).toEqual([]);
  });

  it("returns empty array when bomQuantity is null-ish", () => {
    expect(
      calculateExpectedConsumption(2000, undefined as unknown as number, bomLines),
    ).toEqual([]);
  });

  it("rounds to 4 decimal places", () => {
    const result = calculateExpectedConsumption(1, 3, bomLines);
    expect(result[0].expected_quantity).toBe(16.6667);
  });
});

describe("calculateConsumptionDifference", () => {
  it("returns null when actual is not recorded", () => {
    expect(calculateConsumptionDifference(100, null)).toBeNull();
  });

  it("returns positive difference for over-consumption", () => {
    expect(calculateConsumptionDifference(100, 110)).toBe(10);
  });

  it("returns negative difference for under-consumption", () => {
    expect(calculateConsumptionDifference(100, 95)).toBe(-5);
  });
});

describe("buildShiftInputs", () => {
  const validShift: ShiftFormRecord = {
    id: "temp-1",
    date: "2026-02-01",
    startTime: "08:00",
    endTime: "17:00",
    employeeIds: ["11111111-1111-1111-1111-111111111111"],
  };

  it("combines date and time into full ISO timestamps", () => {
    const result = buildShiftInputs([validShift]);

    expect(result).toHaveLength(1);
    expect(result[0].shift_date).toBe("2026-02-01");
    // Must be a parseable ISO timestamp, not a bare "08:00"
    expect(new Date(result[0].start_time).getTime()).not.toBeNaN();
    expect(result[0].start_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result[0].end_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result[0].employee_ids).toEqual(validShift.employeeIds);
  });

  it("produces null end_time for open shifts", () => {
    const result = buildShiftInputs([{ ...validShift, endTime: null }]);
    expect(result[0].end_time).toBeNull();
  });

  it("drops shift rows with no employees instead of failing the order", () => {
    const result = buildShiftInputs([
      validShift,
      { ...validShift, id: "temp-2", employeeIds: [] },
    ]);
    expect(result).toHaveLength(1);
  });

  it("drops shift rows missing date or start time", () => {
    const result = buildShiftInputs([
      { ...validShift, date: "" },
      { ...validShift, startTime: "" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for no shifts", () => {
    expect(buildShiftInputs([])).toEqual([]);
  });

  it("keeps end shift on the same date as start (ordering preserved)", () => {
    const result = buildShiftInputs([validShift]);
    const start = new Date(result[0].start_time).getTime();
    const end = new Date(result[0].end_time as string).getTime();
    expect(end).toBeGreaterThan(start);
  });
});
