/**
 * The cases these tests exist for are the ones a spreadsheet gets wrong:
 * a commitment that is fully covered on paper and still cannot be met,
 * and a requirement whose production date has already passed.
 */

import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  weekDays,
  weekRangeOf,
  latestProductionDate,
  assessCommitment,
  requirementByDay,
  cellKey,
  gridTotals,
  capacityBand,
  needsAttention,
  riskRank,
} from "./planning-grid";

const FG_8 = "fg-8-inch";
const FG_6 = "fg-6-inch";

describe("date arithmetic", () => {
  it("adds and subtracts days across a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDays("2026-09-02", -3)).toBe("2026-08-30");
  });

  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-09-01", "2026-09-08")).toBe(7);
    expect(daysBetween("2026-09-08", "2026-09-01")).toBe(-7);
  });

  it("survives the IST/UTC trap that shifts a date by one", () => {
    // new Date('2026-09-05') is UTC midnight = 4 Sep in IST. Every function
    // here must parse by components instead, or the whole grid slides a day.
    expect(addDays("2026-09-05", 0)).toBe("2026-09-05");
    expect(weekDays("2026-09-05")[0]).toBe("2026-09-05");
  });
});

describe("factory week", () => {
  it("starts on Saturday and runs seven days", () => {
    const week = weekRangeOf("2026-09-08"); // a Tuesday
    expect(week.start).toBe("2026-09-05"); // the Saturday before
    expect(week.end).toBe("2026-09-11"); // the Friday after
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toBe("2026-09-05");
    expect(week.days[6]).toBe("2026-09-11");
  });

  it("treats Saturday itself as the start of its own week", () => {
    expect(weekRangeOf("2026-09-05").start).toBe("2026-09-05");
  });

  it("keeps Friday in the week that began the previous Saturday", () => {
    expect(weekRangeOf("2026-09-11").start).toBe("2026-09-05");
  });
});

describe("latestProductionDate", () => {
  it("walks back the full curing period", () => {
    // PRD §2.3 / product_planning_params: 7 days for every product today.
    expect(latestProductionDate("2026-09-18", 7)).toBe("2026-09-11");
  });

  it("is the delivery date itself when a product does not cure", () => {
    expect(latestProductionDate("2026-09-18", 0)).toBe("2026-09-18");
  });
});

const base = {
  deliveryDate: "2026-09-18",
  quantity: 900,
  curingDays: 7,
  readyNow: 0,
  readyByDate: 0,
  curingLate: 0,
  plannedInTime: 0,
  plannedTooLate: 0,
};

describe("assessCommitment", () => {
  it("is ready when the bricks are in the yard today", () => {
    const a = assessCommitment({ ...base, readyNow: 900, readyByDate: 900 });
    expect(a.risk).toBe("ready");
    expect(a.shortfall).toBe(0);
  });

  it("separates 'curing but in time' from 'ready'", () => {
    // The bricks exist and will be dispatchable before the 18th — covered,
    // but nobody can touch them today. That is a different kind of comfort.
    const a = assessCommitment({ ...base, readyNow: 0, readyByDate: 900 });
    expect(a.risk).toBe("curing_in_time");
    expect(a.shortfall).toBe(0);
  });

  it("is 'planned' when the promise rests on a shift that has not run", () => {
    const a = assessCommitment({ ...base, plannedInTime: 900 });
    expect(a.risk).toBe("planned");
    expect(a.shortfall).toBe(0);
  });

  it("THE CASE THIS MODULE EXISTS FOR: planned, but too late to cure", () => {
    // 900 planned for the 15th against a delivery on the 18th. Coverage says
    // 100%. The bricks are not dispatchable until the 22nd. A grid that only
    // summed quantities would show this as green and lose the customer.
    const a = assessCommitment({ ...base, plannedTooLate: 900 });
    expect(a.risk).toBe("at_risk");
    expect(a.shortfall).toBe(900);
    expect(a.produceBy).toBe("2026-09-11");
    // Nothing needs to be MADE — it needs to be made EARLIER.
    expect(a.timingOnly).toBe(true);
  });

  it("distinguishes a timing problem from a real shortage", () => {
    // Only 400 of the 900 exists at all, and it is late. Moving it earlier
    // still leaves 500 to make, so this is not merely a scheduling fix.
    const a = assessCommitment({ ...base, plannedTooLate: 400 });
    expect(a.risk).toBe("at_risk");
    expect(a.shortfall).toBe(900);
    expect(a.timingOnly).toBe(false);
  });

  it("is uncovered when nothing is reserved and nothing is planned", () => {
    const a = assessCommitment(base);
    expect(a.risk).toBe("uncovered");
    expect(a.shortfall).toBe(900);
    expect(a.timingOnly).toBe(false);
  });

  it("counts reserved stock curing past the date as late, not as cover", () => {
    const a = assessCommitment({ ...base, curingLate: 900 });
    expect(a.risk).toBe("at_risk");
    expect(a.shortfall).toBe(900);
    expect(a.timingOnly).toBe(true);
  });

  it("adds ready stock and in-time production together", () => {
    const a = assessCommitment({
      ...base,
      readyNow: 400,
      readyByDate: 400,
      plannedInTime: 500,
    });
    expect(a.risk).toBe("planned");
    expect(a.shortfall).toBe(0);
  });

  it("reports the residual shortfall, not the whole quantity, when partly covered", () => {
    const a = assessCommitment({ ...base, readyNow: 700, readyByDate: 700 });
    expect(a.risk).toBe("uncovered");
    expect(a.shortfall).toBe(200);
  });
});

describe("risk ordering", () => {
  it("sorts the worst commitments to the top", () => {
    const sorted = (["ready", "at_risk", "planned", "uncovered"] as const)
      .slice()
      .sort((a, b) => riskRank(a) - riskRank(b));
    expect(sorted).toEqual(["uncovered", "at_risk", "planned", "ready"]);
  });

  it("flags only the two states a human must act on", () => {
    expect(needsAttention("uncovered")).toBe(true);
    expect(needsAttention("at_risk")).toBe(true);
    expect(needsAttention("curing_in_time")).toBe(false);
    expect(needsAttention("planned")).toBe(false);
    expect(needsAttention("ready")).toBe(false);
  });
});

describe("requirementByDay", () => {
  const days = weekDays("2026-09-05"); // Sat 5 Sep – Fri 11 Sep

  it("places a requirement on its produce-by date, not its delivery date", () => {
    const { byProductDay } = requirementByDay(
      [
        {
          finishedGoodId: FG_8,
          deliveryDate: "2026-09-15",
          outstanding: 900,
          curingDays: 7,
        },
      ],
      days,
    );
    // Deliver 15 Sep, cure 7 → must be produced by 8 Sep, inside this week.
    expect(byProductDay.get(cellKey(FG_8, "2026-09-08"))).toBe(900);
    expect(byProductDay.get(cellKey(FG_8, "2026-09-15"))).toBeUndefined();
  });

  it("carries an already-too-late requirement into overdue rather than dropping it", () => {
    // Deliver 9 Sep, cure 7 → produce by 2 Sep, which is last week. This is
    // the worst commitment in the book, so it must not vanish off the left
    // edge of the grid.
    const { byProductDay, overdueByProduct } = requirementByDay(
      [
        {
          finishedGoodId: FG_8,
          deliveryDate: "2026-09-09",
          outstanding: 500,
          curingDays: 7,
        },
      ],
      days,
    );
    expect(overdueByProduct.get(FG_8)).toBe(500);
    expect(byProductDay.size).toBe(0);
  });

  it("holds a requirement for a later week in its own bucket", () => {
    const { beyondByProduct } = requirementByDay(
      [
        {
          finishedGoodId: FG_6,
          deliveryDate: "2026-10-01",
          outstanding: 1000,
          curingDays: 7,
        },
      ],
      days,
    );
    expect(beyondByProduct.get(FG_6)).toBe(1000);
  });

  it("sums several commitments landing on the same produce-by day", () => {
    const { byProductDay } = requirementByDay(
      [
        { finishedGoodId: FG_8, deliveryDate: "2026-09-14", outstanding: 300, curingDays: 7 },
        { finishedGoodId: FG_8, deliveryDate: "2026-09-14", outstanding: 200, curingDays: 7 },
        { finishedGoodId: FG_6, deliveryDate: "2026-09-14", outstanding: 100, curingDays: 7 },
      ],
      days,
    );
    expect(byProductDay.get(cellKey(FG_8, "2026-09-07"))).toBe(500);
    expect(byProductDay.get(cellKey(FG_6, "2026-09-07"))).toBe(100);
  });

  it("ignores commitments already fully covered", () => {
    const { byProductDay, overdueByProduct } = requirementByDay(
      [{ finishedGoodId: FG_8, deliveryDate: "2026-09-14", outstanding: 0, curingDays: 7 }],
      days,
    );
    expect(byProductDay.size).toBe(0);
    expect(overdueByProduct.size).toBe(0);
  });

  it("returns empty buckets for an empty window rather than throwing", () => {
    const r = requirementByDay(
      [{ finishedGoodId: FG_8, deliveryDate: "2026-09-14", outstanding: 10, curingDays: 7 }],
      [],
    );
    expect(r.byProductDay.size).toBe(0);
  });
});

describe("gridTotals", () => {
  it("totals by row, by column and overall", () => {
    const t = gridTotals([
      { finished_good_id: FG_8, date: "2026-09-05", quantity: 900 },
      { finished_good_id: FG_6, date: "2026-09-05", quantity: 1000 },
      { finished_good_id: FG_8, date: "2026-09-06", quantity: 450 },
    ]);
    expect(t.byDay.get("2026-09-05")).toBe(1900);
    expect(t.byDay.get("2026-09-06")).toBe(450);
    expect(t.byProduct.get(FG_8)).toBe(1350);
    expect(t.total).toBe(2350);
  });

  it("treats a non-numeric quantity as zero rather than producing NaN", () => {
    const t = gridTotals([
      { finished_good_id: FG_8, date: "2026-09-05", quantity: Number.NaN },
    ]);
    expect(t.total).toBe(0);
  });
});

describe("capacityBand", () => {
  it("warns when a day is planned over capacity", () => {
    expect(capacityBand(2000, 1800)).toBe("over");
    expect(capacityBand(1800, 1800)).toBe("ok");
  });

  it("says not_evaluated rather than ok when no capacity is configured", () => {
    // Absence of a capacity is not proof the plan fits.
    expect(capacityBand(5000, null)).toBe("not_evaluated");
    expect(capacityBand(5000, 0)).toBe("not_evaluated");
  });
});
