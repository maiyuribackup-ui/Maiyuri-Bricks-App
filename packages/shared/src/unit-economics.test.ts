import { describe, it, expect } from "vitest";
import {
  computeBundle,
  computeRmCostPerKg,
  diffBundles,
  publishBlockers,
  publishWarnings,
  roundMoney,
  stdCostDraftSchema,
  type StdCostBundle,
} from "./unit-economics";

// The go-live seed (supabase/migrations/20260822120100_std_cost_seed_v1.sql).
// These expectations are the contract between the TypeScript formulas used for
// live editing and the SQL view v_std_cost_brick_type_computed: if either side
// drifts, this file is where it gets caught.
function seedBundle(): StdCostBundle {
  return {
    version: {
      id: "00000000-0000-0000-0000-000000000001",
      status: "draft",
      valid_from: null,
      monthly_production_basis: 15000,
      notes: null,
      created_by: null,
      created_at: "2026-08-22T00:00:00Z",
      updated_by: null,
      updated_at: "2026-08-22T00:00:00Z",
      published_by: null,
      published_at: null,
    },
    rm_prices: [
      { rm_key: "cement", display_name: "Cement", purchase_amount: 320, purchase_unit_label: "50 Kg Bag", purchase_unit_kg: 50 },
      { rm_key: "chemical", display_name: "Chemical", purchase_amount: 1850, purchase_unit_label: "25 Kg Can", purchase_unit_kg: 25 },
      { rm_key: "msand_dust", display_name: "M-Sand Dust", purchase_amount: 4512.5, purchase_unit_label: "Per Unit or 8000 Kgs", purchase_unit_kg: 8000 },
      { rm_key: "msand_waste", display_name: "M-Sand Waste", purchase_amount: 1937.5, purchase_unit_label: "Per Unit or 8000 Kgs", purchase_unit_kg: 8000 },
      { rm_key: "red_soil", display_name: "Red Soil", purchase_amount: 4712.5, purchase_unit_label: "Per Load", purchase_unit_kg: 3705 },
      { rm_key: "red_soil_gravel", display_name: "Red Soil Gravel", purchase_amount: 3600, purchase_unit_label: "Per Load", purchase_unit_kg: 4500 },
    ],
    fixed_items: [
      { item_key: "machine_repair", display_name: "Machine Repair", monthly_amount: 5000 },
      { item_key: "rent", display_name: "Rent", monthly_amount: 2500 },
      { item_key: "misc", display_name: "Miscellaneous", monthly_amount: 3000 },
      { item_key: "stacking_curing", display_name: "Stacking & Curing", monthly_amount: 3000 },
      { item_key: "manager_salary", display_name: "Manager Salary", monthly_amount: 60000 },
      { item_key: "marketing", display_name: "Marketing", monthly_amount: 5000 },
    ],
    brick_types: [
      {
        brick_type: "8 CIB", odoo_product_match: "CIB-10*8*5%", bricks_per_batch: 9,
        labor_cost_per_batch: 63, electricity_per_unit: 1, depreciation_per_unit: 1,
        sales_price: 54, loading_unloading_per_unit: 3, transport_per_unit: 3, commission_per_unit: 1,
        recipe: [
          { rm_key: "cement", kg_per_batch: 8.5 }, { rm_key: "chemical", kg_per_batch: 0.1 },
          { rm_key: "msand_dust", kg_per_batch: 74 }, { rm_key: "msand_waste", kg_per_batch: 49 },
        ],
      },
      {
        brick_type: "6 CIB", odoo_product_match: "CIB-11*6*5%", bricks_per_batch: 9,
        labor_cost_per_batch: 54, electricity_per_unit: 1, depreciation_per_unit: 1,
        sales_price: 45, loading_unloading_per_unit: 3, transport_per_unit: 3, commission_per_unit: 1,
        recipe: [
          { rm_key: "cement", kg_per_batch: 9.4 }, { rm_key: "chemical", kg_per_batch: 0.1 },
          { rm_key: "msand_dust", kg_per_batch: 81.8 }, { rm_key: "msand_waste", kg_per_batch: 13.7 },
        ],
      },
      {
        brick_type: "8 MIB", odoo_product_match: "MIB-10*8*5%", bricks_per_batch: 8,
        labor_cost_per_batch: 56, electricity_per_unit: 1, depreciation_per_unit: 1.5,
        sales_price: 55, loading_unloading_per_unit: 3, transport_per_unit: 3, commission_per_unit: 1,
        recipe: [
          { rm_key: "cement", kg_per_batch: 9.165 }, { rm_key: "chemical", kg_per_batch: 0.1 },
          { rm_key: "msand_dust", kg_per_batch: 18.28 }, { rm_key: "red_soil", kg_per_batch: 66 },
        ],
      },
      {
        brick_type: "6 MIB", odoo_product_match: "MIB-10*6*5%", bricks_per_batch: 11,
        labor_cost_per_batch: 66, electricity_per_unit: 1, depreciation_per_unit: 1,
        sales_price: 46, loading_unloading_per_unit: 3, transport_per_unit: 3, commission_per_unit: 1,
        recipe: [
          { rm_key: "cement", kg_per_batch: 9 }, { rm_key: "chemical", kg_per_batch: 0.1 },
          { rm_key: "msand_dust", kg_per_batch: 25 }, { rm_key: "red_soil", kg_per_batch: 65 },
        ],
      },
    ],
  };
}

const byType = (bundle: StdCostBundle, type: string) => {
  const found = computeBundle(bundle).brick_types.find((bt) => bt.brick_type === type);
  if (!found) throw new Error(`No computed brick type ${type}`);
  return found;
};

describe("computeRmCostPerKg", () => {
  it("derives cost per kg from the purchase inputs", () => {
    expect(computeRmCostPerKg({ purchase_amount: 320, purchase_unit_kg: 50 })).toBe(6.4);
  });

  it("computes chemical at 74/kg from 1850 per 25 kg — the sheet's 80 was stale", () => {
    // The bug this module exists to make impossible: a derived number that
    // disagrees with its own inputs. 1850/25 = 74, always.
    expect(computeRmCostPerKg({ purchase_amount: 1850, purchase_unit_kg: 25 })).toBe(74);
  });

  it("returns 0 rather than Infinity when the unit weight is unusable", () => {
    expect(computeRmCostPerKg({ purchase_amount: 320, purchase_unit_kg: 0 })).toBe(0);
  });
});

describe("computeBundle — seed version", () => {
  it("spreads the monthly fixed costs over the production basis", () => {
    const computed = computeBundle(seedBundle());
    expect(computed.monthly_fixed_total).toBe(78500);
    expect(computed.fixed_cost_per_unit).toBeCloseTo(78500 / 15000, 10);
  });

  it("computes 8 CIB end to end", () => {
    const bt = byType(seedBundle(), "8 CIB");
    expect(bt.material_cost_per_batch).toBeCloseTo(115.4078125, 6);
    expect(roundMoney(bt.material_cost_per_unit)).toBe(12.82);
    expect(bt.labor_cost_per_unit).toBe(7);
    expect(bt.overhead_per_unit).toBe(2);
    expect(roundMoney(bt.variable_cost_per_unit)).toBe(21.82);
    expect(roundMoney(bt.total_cost_per_unit)).toBe(27.06);
    // 54 − 3 loading − 3 transport − 1 commission − total
    expect(roundMoney(bt.margin_per_unit ?? 0)).toBe(19.94);
    expect(roundMoney(bt.bricks_per_cement_bag ?? 0)).toBe(52.94);
  });

  it("computes every seeded brick type's total cost per unit", () => {
    const bundle = seedBundle();
    expect(roundMoney(byType(bundle, "8 CIB").total_cost_per_unit)).toBe(27.06);
    expect(roundMoney(byType(bundle, "6 CIB").total_cost_per_unit)).toBe(26.24);
    expect(roundMoney(byType(bundle, "8 MIB").total_cost_per_unit)).toBe(34.77);
    expect(roundMoney(byType(bundle, "6 MIB").total_cost_per_unit)).toBe(27.94);
  });

  it("keeps total = variable + fixed for every brick type", () => {
    for (const bt of computeBundle(seedBundle()).brick_types) {
      expect(bt.total_cost_per_unit).toBeCloseTo(bt.variable_cost_per_unit + bt.fixed_cost_per_unit, 10);
    }
  });

  it("re-derives every total when a raw material price changes", () => {
    const bundle = seedBundle();
    const before = byType(bundle, "8 CIB").total_cost_per_unit;
    const cement = bundle.rm_prices.find((rm) => rm.rm_key === "cement");
    if (!cement) throw new Error("no cement");
    cement.purchase_amount = 400; // 8.00/kg
    const after = byType(bundle, "8 CIB");
    // 8.5 kg × (8.00 − 6.40) = 13.60 per batch over 9 bricks
    expect(after.total_cost_per_unit - before).toBeCloseTo((8.5 * 1.6) / 9, 10);
  });
});

describe("computeBundle — edge cases", () => {
  it("does not divide by zero when a batch makes no bricks", () => {
    const bundle = seedBundle();
    bundle.brick_types[0].bricks_per_batch = 0;
    const bt = byType(bundle, "8 CIB");
    expect(bt.material_cost_per_unit).toBe(0);
    expect(bt.labor_cost_per_unit).toBe(0);
    expect(Number.isFinite(bt.total_cost_per_unit)).toBe(true);
  });

  it("flags recipe lines whose raw material has no price", () => {
    const bundle = seedBundle();
    bundle.rm_prices = bundle.rm_prices.filter((rm) => rm.rm_key !== "msand_dust");
    expect(byType(bundle, "8 CIB").missing_rm_keys).toEqual(["msand_dust"]);
  });

  it("returns a null margin when there is no sales price", () => {
    const bundle = seedBundle();
    bundle.brick_types[0].sales_price = null;
    expect(byType(bundle, "8 CIB").margin_per_unit).toBeNull();
  });

  it("returns null bricks-per-cement-bag when the recipe has no cement", () => {
    const bundle = seedBundle();
    bundle.brick_types[0].recipe = bundle.brick_types[0].recipe.filter((l) => l.rm_key !== "cement");
    expect(byType(bundle, "8 CIB").bricks_per_cement_bag).toBeNull();
  });
});

describe("publishBlockers", () => {
  it("passes the seed version", () => {
    expect(publishBlockers(seedBundle())).toEqual([]);
  });

  it("blocks a brick type with no cement recipe line", () => {
    const bundle = seedBundle();
    bundle.brick_types[1].recipe = bundle.brick_types[1].recipe.filter((l) => l.rm_key !== "cement");
    const blockers = publishBlockers(bundle);
    expect(blockers.some((b) => b.brick_type === "6 CIB" && b.message.includes("cement"))).toBe(true);
  });

  it("blocks a zero total cost per unit", () => {
    const bundle = seedBundle();
    bundle.brick_types = [
      {
        ...bundle.brick_types[0],
        labor_cost_per_batch: 0,
        electricity_per_unit: 0,
        depreciation_per_unit: 0,
        recipe: [{ rm_key: "cement", kg_per_batch: 0.001 }],
      },
    ];
    bundle.fixed_items = [];
    bundle.brick_types[0].recipe = [{ rm_key: "cement", kg_per_batch: 0 }];
    expect(publishBlockers(bundle).some((b) => b.message.includes("Total cost per unit"))).toBe(true);
  });

  it("blocks a version with no brick types", () => {
    const bundle = seedBundle();
    bundle.brick_types = [];
    expect(publishBlockers(bundle).some((b) => b.message === "No brick types defined")).toBe(true);
  });
});

describe("publishWarnings", () => {
  it("is quiet when nothing moved", () => {
    expect(publishWarnings(seedBundle(), seedBundle())).toEqual([]);
  });

  it("is quiet for a small move", () => {
    const draft = seedBundle();
    const cement = draft.rm_prices.find((rm) => rm.rm_key === "cement");
    if (!cement) throw new Error("no cement");
    cement.purchase_amount = 330;
    expect(publishWarnings(draft, seedBundle())).toEqual([]);
  });

  it("warns when a total moves more than 15%", () => {
    const draft = seedBundle();
    for (const rm of draft.rm_prices) rm.purchase_amount *= 2;
    const warnings = publishWarnings(draft, seedBundle());
    expect(warnings.length).toBe(4);
    expect(warnings[0].change_pct).toBeGreaterThan(15);
  });

  it("has nothing to compare against when nothing is published yet", () => {
    expect(publishWarnings(seedBundle(), null)).toEqual([]);
  });
});

describe("diffBundles", () => {
  it("finds nothing between identical versions", () => {
    expect(diffBundles(seedBundle(), seedBundle())).toEqual([]);
  });

  it("reports the changed input and every total it moved", () => {
    const after = seedBundle();
    const cement = after.rm_prices.find((rm) => rm.rm_key === "cement");
    if (!cement) throw new Error("no cement");
    cement.purchase_amount = 400;

    const rows = diffBundles(seedBundle(), after);
    const purchase = rows.find((r) => r.section === "raw_material" && r.label === "Purchase amount");
    expect(purchase).toMatchObject({ group: "Cement", before: 320, after: 400 });

    const costPerKg = rows.find((r) => r.section === "raw_material" && r.label === "Cost / kg");
    expect(costPerKg).toMatchObject({ before: 6.4, after: 8 });

    // all four brick types' totals moved
    const totals = rows.filter((r) => r.section === "computed" && r.label === "Total cost / unit");
    expect(totals.length).toBe(4);
  });

  it("reports recipe changes per brick type", () => {
    const after = seedBundle();
    after.brick_types[0].recipe[0].kg_per_batch = 9;
    const rows = diffBundles(seedBundle(), after);
    expect(rows.some((r) => r.section === "recipe" && r.group === "8 CIB" && r.before === 8.5 && r.after === 9)).toBe(true);
  });

  it("shows an added and a removed brick type as null on one side", () => {
    const after = seedBundle();
    after.brick_types = after.brick_types.filter((bt) => bt.brick_type !== "6 MIB");
    const rows = diffBundles(seedBundle(), after);
    expect(rows.some((r) => r.group === "6 MIB" && r.after === null)).toBe(true);
  });

  it("returns nothing when there is no version to compare against", () => {
    expect(diffBundles(null, seedBundle())).toEqual([]);
  });
});

describe("roundMoney", () => {
  it("rounds to 2 dp by default", () => {
    expect(roundMoney(27.0564)).toBe(27.06);
  });
  it("never returns -0", () => {
    expect(Object.is(roundMoney(-0.0001), 0)).toBe(true);
  });
  it("is null-safe", () => {
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
    expect(roundMoney(Number.NaN)).toBe(0);
  });
});

describe("stdCostDraftSchema", () => {
  const base = {
    version_id: "00000000-0000-0000-0000-000000000001",
    monthly_production_basis: 15000,
    rm_prices: [],
    brick_types: [],
    fixed_items: [],
  };

  it("accepts a well-formed draft", () => {
    expect(stdCostDraftSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero production basis (it is a divisor)", () => {
    expect(stdCostDraftSchema.safeParse({ ...base, monthly_production_basis: 0 }).success).toBe(false);
  });

  it("rejects a raw material with a zero purchase unit weight", () => {
    const parsed = stdCostDraftSchema.safeParse({
      ...base,
      rm_prices: [{ rm_key: "cement", display_name: "Cement", purchase_amount: 320, purchase_unit_label: "Bag", purchase_unit_kg: 0 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative cost", () => {
    const parsed = stdCostDraftSchema.safeParse({
      ...base,
      fixed_items: [{ item_key: "rent", display_name: "Rent", monthly_amount: -1 }],
    });
    expect(parsed.success).toBe(false);
  });
});
