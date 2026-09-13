import { describe, it, expect } from "vitest";
import { bricksPerBag, assessRatio, isValidBagStep } from "./cement-ratio";
import type { ConsumptionStandard } from "./rates";

const std = (over: Partial<ConsumptionStandard> = {}): ConsumptionStandard => ({
  id: "std-1",
  finished_good_id: "fg-8in",
  material: "cement",
  standard_yield: 140,
  tolerance_pct: null,
  effective_from: "2026-08-01",
  effective_to: null,
  active: true,
  ...over,
});

const TOL = { amberPct: 5, redPct: 10 };

describe("bricksPerBag — PRD §35, always GROSS", () => {
  it("the PRD's worked case: 700 gross / 4.5 bags", () => {
    expect(bricksPerBag(700, 4.5)).toBeCloseTo(155.56, 2);
  });

  it("zero bags is a missing measurement, not infinity", () => {
    // Returning Infinity here would render as a wildly green ratio on a shift
    // where nobody recorded the cement at all.
    expect(bricksPerBag(700, 0)).toBeNull();
  });

  it("rejects negative and non-finite inputs", () => {
    expect(bricksPerBag(-700, 4.5)).toBeNull();
    expect(bricksPerBag(700, -1)).toBeNull();
    expect(bricksPerBag(Number.NaN, 4.5)).toBeNull();
  });

  it("zero output with cement used is a real ratio of zero", () => {
    // A shift that burned cement and produced nothing is the worst possible
    // ratio, not an absent one.
    expect(bricksPerBag(0, 4.5)).toBe(0);
  });
});

describe("assessRatio", () => {
  it("bands on standard when within tolerance", () => {
    const r = assessRatio({
      grossQty: 1400, bags: 10, standards: [std()],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(r.actual).toBe(140);
    expect(r.deviationPct).toBe(0);
    expect(r.band).toBe("green");
  });

  it("amber past the amber threshold, red past red", () => {
    // 133 per bag against a 140 standard is −5%; 125 is −10.7%.
    const amber = assessRatio({
      grossQty: 1330, bags: 10, standards: [std()],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    const red = assessRatio({
      grossQty: 1250, bags: 10, standards: [std()],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(amber.band).toBe("green"); // exactly 5% is not yet past 5%
    expect(red.band).toBe("red");
  });

  it("over-use and under-use are both flagged", () => {
    // Using far LESS cement than standard is not good news — it usually means
    // a mis-measured batch or a mis-recorded figure.
    const under = assessRatio({
      grossQty: 1600, bags: 10, standards: [std()],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(under.deviationPct).toBeCloseTo(14.29, 2);
    expect(under.band).toBe("red");
  });

  it("no standard set means not_evaluated, never red", () => {
    // The standards table ships empty by design (§100). Rendering that as a
    // failure would train people to ignore the colour.
    const r = assessRatio({
      grossQty: 1400, bags: 10, standards: [],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(r.band).toBe("not_evaluated");
    expect(r.actual).toBe(140);       // the fact is still reported
    expect(r.deviationPct).toBeNull(); // the verdict is not
  });

  it("no cement recorded is not_evaluated", () => {
    const r = assessRatio({
      grossQty: 1400, bags: 0, standards: [std()],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(r.band).toBe("not_evaluated");
    expect(r.actual).toBeNull();
  });

  it("judges August production by August's standard after September's exists", () => {
    // The §60 rule, applied to recipes rather than rates.
    const standards = [
      std({ id: "aug", standard_yield: 140, effective_from: "2026-08-01", effective_to: "2026-08-31" }),
      std({ id: "sep", standard_yield: 150, effective_from: "2026-09-01" }),
    ];
    const august = assessRatio({
      grossQty: 1400, bags: 10, standards,
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    const september = assessRatio({
      grossQty: 1400, bags: 10, standards,
      finishedGoodId: "fg-8in", onDate: "2026-09-05", tolerances: TOL,
    });
    expect(august.standard).toBe(140);
    expect(august.standardId).toBe("aug");
    expect(august.band).toBe("green");
    expect(september.standard).toBe(150);
    expect(september.band).toBe("amber"); // 140 vs 150 is −6.7%
  });

  it("a per-product tolerance widens amber but not red", () => {
    const wide = std({ tolerance_pct: 12 });
    const r = assessRatio({
      grossQty: 1300, bags: 10, standards: [wide],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    // −7.1%: inside the product's 12% amber, but red is the global 10% line.
    expect(r.deviationPct).toBeCloseTo(-7.14, 2);
    expect(r.band).toBe("green");

    const far = assessRatio({
      grossQty: 1200, bags: 10, standards: [wide],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(far.band).toBe("red"); // −14.3% is past red regardless
  });

  it("ignores another product's standard", () => {
    const r = assessRatio({
      grossQty: 1400, bags: 10, standards: [std({ finished_good_id: "fg-6in" })],
      finishedGoodId: "fg-8in", onDate: "2026-08-20", tolerances: TOL,
    });
    expect(r.band).toBe("not_evaluated");
  });
});

describe("isValidBagStep", () => {
  it("accepts half bags and whole bags", () => {
    expect(isValidBagStep(4.5, 0.5)).toBe(true);
    expect(isValidBagStep(5, 0.5)).toBe(true);
    expect(isValidBagStep(0, 0.5)).toBe(true);
  });

  it("rejects a value off the step", () => {
    expect(isValidBagStep(4.3, 0.5)).toBe(false);
  });

  it("survives binary floating point", () => {
    // 4.5 % 0.5 is not 0 in IEEE754; a naive modulo rejects a valid entry.
    for (const b of [0.5, 1.5, 2.5, 10.5, 99.5]) {
      expect(isValidBagStep(b, 0.5)).toBe(true);
    }
  });

  it("rejects negatives", () => {
    expect(isValidBagStep(-1, 0.5)).toBe(false);
  });

  it("allows anything when the step is unconfigured", () => {
    expect(isValidBagStep(4.3, 0)).toBe(true);
  });
});
