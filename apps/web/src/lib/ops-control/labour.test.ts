import { describe, it, expect } from "vitest";
import {
  canTransition,
  summariseWeek,
  weekRange,
  recentWeeks,
  summariseUnpriced,
  type LedgerEntry,
  type SettlementStatus,
} from "./labour";

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "e1",
  entry_date: "2026-09-02",
  week_start: "2026-08-29",
  activity_code: "production",
  finished_good_id: "fg-8in",
  source_type: "production_actual",
  eligible_qty: 1000,
  rate_applied: 7,
  amount: 7000,
  settlement_id: null,
  ...over,
});

describe("canTransition — the settlement ladder", () => {
  it("moves forward, including skipping a rung", () => {
    // A business that pays on approval should not be forced through a
    // separate "paid" step it does not use.
    expect(canTransition("draft", "reviewed")).toBe(true);
    expect(canTransition("reviewed", "approved")).toBe(true);
    expect(canTransition("approved", "locked")).toBe(true);
    expect(canTransition("draft", "paid")).toBe(true);
  });

  it("allows unreviewing, but never unapproving", () => {
    // Once approved, money is committed; the correction path is a
    // differential in the current week (§67), not an unapproval.
    expect(canTransition("reviewed", "draft")).toBe(true);
    expect(canTransition("approved", "reviewed")).toBe(false);
    expect(canTransition("paid", "approved")).toBe(false);
  });

  it("treats locked as terminal", () => {
    for (const to of ["draft", "reviewed", "approved", "paid"] as SettlementStatus[]) {
      expect(canTransition("locked", to)).toBe(false);
    }
    expect(canTransition("locked", "locked")).toBe(true);
  });
});

describe("summariseWeek", () => {
  it("rolls up by activity and totals the week", () => {
    const s = summariseWeek("2026-08-29", [
      entry({ activity_code: "production", amount: 7000, eligible_qty: 1000 }),
      entry({ id: "e2", activity_code: "loading", amount: 2700, eligible_qty: 900 }),
      entry({ id: "e3", activity_code: "unloading", amount: 1700, eligible_qty: 850 }),
    ]);
    expect(s.total).toBe(11400);
    expect(s.entry_count).toBe(3);
    expect(s.by_activity.map((a) => a.activity_code)).toEqual([
      "loading", "production", "unloading",
    ]);
    expect(s.by_activity.find((a) => a.activity_code === "loading")?.quantity).toBe(900);
  });

  it("combines several entries for the same activity", () => {
    const s = summariseWeek("2026-08-29", [
      entry({ amount: 7000, eligible_qty: 1000 }),
      entry({ id: "e2", amount: 7500, eligible_qty: 1000 }),
    ]);
    expect(s.by_activity).toHaveLength(1);
    expect(s.by_activity[0].amount).toBe(14500);
    expect(s.by_activity[0].entries).toBe(2);
  });

  it("counts differentials separately as well as in the total", () => {
    // "Rs.6,300 payable" and "Rs.6,300 payable, of which Rs.-700 corrects a
    // week already paid" answer different questions at the settlement meeting.
    const s = summariseWeek("2026-09-05", [
      entry({ amount: 7000 }),
      entry({
        id: "e2",
        amount: -700,
        eligible_qty: -100,
        source_type: "production_actual_adjustment",
      }),
    ]);
    expect(s.total).toBe(6300);
    expect(s.differential_count).toBe(1);
    expect(s.differential_total).toBe(-700);
  });

  it("handles an empty week without inventing a total", () => {
    const s = summariseWeek("2026-08-29", []);
    expect(s.total).toBe(0);
    expect(s.entry_count).toBe(0);
    expect(s.by_activity).toEqual([]);
  });

  it("derives the week end from the start", () => {
    expect(summariseWeek("2026-08-29", []).week_end).toBe("2026-09-04");
  });
});

describe("weekRange — the Sat–Fri factory week", () => {
  it("a Saturday is its own week start", () => {
    expect(weekRange("2026-08-29")).toEqual({ start: "2026-08-29", end: "2026-09-04" });
  });

  it("a Friday closes the week that began the previous Saturday", () => {
    expect(weekRange("2026-09-04")).toEqual({ start: "2026-08-29", end: "2026-09-04" });
  });

  it("a Sunday belongs to the week that started the day before", () => {
    expect(weekRange("2026-08-30").start).toBe("2026-08-29");
  });

  it("works across a month boundary", () => {
    expect(weekRange("2026-09-01").start).toBe("2026-08-29");
  });
});

describe("recentWeeks", () => {
  it("walks back one week at a time, newest first", () => {
    expect(recentWeeks("2026-09-02", 3)).toEqual([
      "2026-08-29", "2026-08-22", "2026-08-15",
    ]);
  });

  it("crosses a year boundary without drifting", () => {
    expect(recentWeeks("2027-01-05", 2)).toEqual(["2027-01-02", "2026-12-26"]);
  });

  it("returns nothing for a non-positive count", () => {
    expect(recentWeeks("2026-09-02", 0)).toEqual([]);
  });
});

describe("summariseUnpriced", () => {
  it("groups unpriced work by activity", () => {
    // Not an error state: the rate masters ship empty by design, so on day
    // one everything is unpriced and the point is that it stays visible.
    const s = summariseUnpriced([
      { source_type: "production_actual", source_id: "a", activity_code: "production",
        finished_good_id: "fg", product_name: "8in", entry_date: "2026-09-02", quantity: 1000 },
      { source_type: "production_actual", source_id: "b", activity_code: "production",
        finished_good_id: "fg", product_name: "8in", entry_date: "2026-09-03", quantity: 500 },
      { source_type: "trip_load_line", source_id: "c", activity_code: "loading",
        finished_good_id: "fg", product_name: "8in", entry_date: "2026-09-03", quantity: 900 },
    ]);
    expect(s.count).toBe(3);
    expect(s.quantity).toBe(2400);
    expect(s.byActivity).toEqual([
      { activity_code: "loading", count: 1, quantity: 900 },
      { activity_code: "production", count: 2, quantity: 1500 },
    ]);
  });

  it("reports nothing unpriced as zero rather than absent", () => {
    expect(summariseUnpriced([])).toEqual({ count: 0, quantity: 0, byActivity: [] });
  });
});
