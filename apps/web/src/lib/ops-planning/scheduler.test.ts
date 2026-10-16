import { describe, expect, it } from "vitest";
import {
  addDays,
  isoWeekday,
  schedule,
  simulatePromise,
  type DemandOrder,
  type PlanningProduct,
  type SchedulerConfig,
} from "./scheduler";

// 2026-07-06 is a Monday.
const MON = "2026-07-06";
const WORK_WEEK = [1, 2, 3, 4, 5, 6]; // Mon–Sat

const baseConfig: SchedulerConfig = {
  start_date: MON,
  horizon_days: 30,
  work_days: WORK_WEEK,
  max_deliveries_per_day: 4,
};

function product(over: Partial<PlanningProduct> = {}): PlanningProduct {
  return {
    finished_good_id: "fg-8mud",
    product_name: "8 inch mud interlock",
    daily_capacity: 1000,
    curing_days: 7,
    stock_qty: 0,
    ...over,
  };
}

function order(over: Partial<DemandOrder> = {}): DemandOrder {
  return {
    order_ref: "SO001",
    customer_name: "Kumar",
    priority_rank: 1,
    lines: [
      { finished_good_id: "fg-8mud", product_name: "8 inch mud interlock", remaining: 1000 },
    ],
    ...over,
  };
}

describe("date helpers", () => {
  it("addDays crosses months", () => {
    expect(addDays("2026-07-30", 3)).toBe("2026-08-02");
  });
  it("isoWeekday: 2026-07-06 is Monday(1), 2026-07-12 is Sunday(7)", () => {
    expect(isoWeekday("2026-07-06")).toBe(1);
    expect(isoWeekday("2026-07-12")).toBe(7);
  });
});

describe("curing", () => {
  it("delivery happens only after curing completes", () => {
    const res = schedule([product()], [order()], baseConfig);
    const prod = res.items.filter((i) => i.item_type === "production");
    const del = res.items.find((i) => i.item_type === "delivery");
    expect(prod).toHaveLength(1);
    expect(prod[0].item_date).toBe(MON);
    // produced Mon 6th + 7 curing days = Mon 13th (a workday)
    expect(del?.item_date).toBe("2026-07-13");
    expect(res.promises[0].promised_delivery_date).toBe("2026-07-13");
  });

  it("curing landing on Sunday pushes delivery to Monday", () => {
    // Produce Sat 11th (block Mon-Fri), curing 1 → ready Sun 12th → deliver Mon 13th
    const res = schedule(
      [product({ curing_days: 1 })],
      [order()],
      {
        ...baseConfig,
        capacity_overrides: [
          { date: "2026-07-06", blocked: true },
          { date: "2026-07-07", blocked: true },
          { date: "2026-07-08", blocked: true },
          { date: "2026-07-09", blocked: true },
          { date: "2026-07-10", blocked: true },
        ],
      },
    );
    const prod = res.items.filter((i) => i.item_type === "production");
    expect(prod[0].item_date).toBe("2026-07-11"); // Saturday
    const del = res.items.find((i) => i.item_type === "delivery");
    expect(del?.item_date).toBe("2026-07-13"); // Monday, not Sunday 12th
  });
});

describe("working days", () => {
  it("never schedules production on Sunday", () => {
    // 2500 units at 1000/day starting Sat 11th → Sat, Mon, Tue (skips Sun 12th)
    const res = schedule(
      [product()],
      [order({ lines: [{ finished_good_id: "fg-8mud", product_name: "x", remaining: 2500 }] })],
      { ...baseConfig, start_date: "2026-07-11" },
    );
    const dates = res.items
      .filter((i) => i.item_type === "production")
      .map((i) => i.item_date);
    expect(dates).toEqual(["2026-07-11", "2026-07-13", "2026-07-14"]);
    expect(dates.some((d) => isoWeekday(d) === 7)).toBe(false);
  });
});

describe("capacity", () => {
  it("splits demand across days at daily capacity", () => {
    const res = schedule(
      [product()],
      [order({ lines: [{ finished_good_id: "fg-8mud", product_name: "x", remaining: 2500 }] })],
      baseConfig,
    );
    const qtys = res.items
      .filter((i) => i.item_type === "production")
      .map((i) => i.quantity);
    expect(qtys).toEqual([1000, 1000, 500]);
  });

  it("respects blocked-day overrides", () => {
    const res = schedule(
      [product()],
      [order({ lines: [{ finished_good_id: "fg-8mud", product_name: "x", remaining: 2000 }] })],
      {
        ...baseConfig,
        capacity_overrides: [{ date: "2026-07-07", blocked: true }], // Tue blocked
      },
    );
    const dates = res.items
      .filter((i) => i.item_type === "production")
      .map((i) => i.item_date);
    expect(dates).toEqual(["2026-07-06", "2026-07-08"]); // Mon, Wed
  });

  it("higher-priority order gets capacity first", () => {
    const res = schedule(
      [product()],
      [
        order({ order_ref: "SO-LOW", priority_rank: 2 }),
        order({ order_ref: "SO-HIGH", priority_rank: 1 }),
      ],
      baseConfig,
    );
    const high = res.promises.find((p) => p.order_ref === "SO-HIGH")!;
    const low = res.promises.find((p) => p.order_ref === "SO-LOW")!;
    expect(high.promised_delivery_date! < low.promised_delivery_date!).toBe(true);
  });
});

describe("stock", () => {
  it("serves from stock before producing", () => {
    const res = schedule([product({ stock_qty: 600 })], [order()], baseConfig);
    const prod = res.items.filter((i) => i.item_type === "production");
    expect(prod).toHaveLength(1);
    expect(prod[0].quantity).toBe(400);
  });

  it("full stock coverage delivers without any production", () => {
    const res = schedule([product({ stock_qty: 5000 })], [order()], baseConfig);
    expect(res.items.filter((i) => i.item_type === "production")).toHaveLength(0);
    const del = res.items.find((i) => i.item_type === "delivery");
    expect(del?.item_date).toBe(MON); // dispatchable immediately
  });
});

describe("deliveries per day cap", () => {
  it("bumps overflow deliveries to the next workday", () => {
    const products = [product({ stock_qty: 10_000 })];
    const orders = [1, 2, 3].map((n) =>
      order({ order_ref: `SO00${n}`, priority_rank: n }),
    );
    const res = schedule(products, orders, {
      ...baseConfig,
      max_deliveries_per_day: 2,
    });
    const dels = res.items
      .filter((i) => i.item_type === "delivery")
      .map((i) => i.item_date);
    expect(dels).toEqual([MON, MON, "2026-07-07"]);
  });
});

describe("lateness & warnings", () => {
  it("flags orders promised after their commitment date", () => {
    const res = schedule(
      [product()],
      [order({ commitment_date: "2026-07-08T00:00:00Z" })], // needs 13th
      baseConfig,
    );
    expect(res.promises[0].late_vs_commitment).toBe(true);
    expect(res.warnings.some((w) => w.type === "late_order")).toBe(true);
  });

  it("warns when a line has no planning parameters", () => {
    const res = schedule(
      [product()],
      [
        order({
          lines: [{ finished_good_id: "fg-unknown", product_name: "mystery", remaining: 10 }],
        }),
      ],
      baseConfig,
    );
    expect(res.warnings.some((w) => w.type === "unfulfillable")).toBe(true);
    expect(res.promises[0].unfulfilled_units).toBe(10);
  });
});

describe("simulatePromise", () => {
  it("accounts for existing demand ahead of the prospect", () => {
    const clean = simulatePromise([product()], [], "fg-8mud", 1000, baseConfig);
    const busy = simulatePromise(
      [product()],
      [order({ lines: [{ finished_good_id: "fg-8mud", product_name: "x", remaining: 3000 }] })],
      "fg-8mud",
      1000,
      baseConfig,
    );
    expect(clean.promised_delivery_date).toBe("2026-07-13");
    expect(busy.promised_delivery_date! > clean.promised_delivery_date!).toBe(true);
  });
});
