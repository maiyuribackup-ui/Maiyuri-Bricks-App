import { describe, it, expect } from "vitest";
import { computeBundle, type StdCostBundle, type StdCostVersion } from "@maiyuri/shared";
import { inr, issueFor, toBundle, toForm, toNumber, toPayload, validateForm } from "./form";

const version: StdCostVersion = {
  id: "11111111-1111-1111-1111-111111111111",
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
};

const bundle: StdCostBundle = {
  version,
  rm_prices: [
    { rm_key: "cement", display_name: "Cement", purchase_amount: 320, purchase_unit_label: "50 Kg Bag", purchase_unit_kg: 50 },
  ],
  fixed_items: [{ item_key: "rent", display_name: "Rent", monthly_amount: 2500 }],
  brick_types: [
    {
      brick_type: "8 CIB",
      odoo_product_match: "CIB-10*8*5%",
      bricks_per_batch: 9,
      labor_cost_per_batch: 63,
      electricity_per_unit: 1,
      depreciation_per_unit: 1,
      sales_price: 54,
      loading_unloading_per_unit: 3,
      transport_per_unit: 3,
      commission_per_unit: 1,
      recipe: [{ rm_key: "cement", kg_per_batch: 8.5 }],
    },
  ],
};

describe("toForm / toBundle round trip", () => {
  it("survives the trip unchanged", () => {
    const round = toBundle(toForm(bundle), version);
    expect(round.rm_prices).toEqual(bundle.rm_prices);
    expect(round.fixed_items).toEqual(bundle.fixed_items);
    expect(round.brick_types[0]).toMatchObject({
      brick_type: "8 CIB",
      bricks_per_batch: 9,
      sales_price: 54,
      recipe: [{ rm_key: "cement", kg_per_batch: 8.5 }],
    });
  });

  it("keeps an empty sales price as null rather than 0", () => {
    const form = toForm(bundle);
    form.brick_types[0].sales_price = "";
    expect(toBundle(form, version).brick_types[0].sales_price).toBeNull();
  });

  it("computes live from a half-typed field without producing NaN", () => {
    const form = toForm(bundle);
    form.rm_prices[0].purchase_amount = ""; // mid-keystroke
    const computed = computeBundle(toBundle(form, version));
    expect(computed.rm_prices[0].cost_per_kg).toBe(0);
    expect(Number.isFinite(computed.brick_types[0].total_cost_per_unit)).toBe(true);
  });

  it("builds a payload the API schema accepts", () => {
    const payload = toPayload(toForm(bundle), version);
    expect(payload.version_id).toBe(version.id);
    expect(payload.monthly_production_basis).toBe(15000);
    expect(payload.brick_types[0].sort_order).toBe(0);
  });
});

describe("toNumber", () => {
  it("treats empty and unparseable input as 0", () => {
    expect(toNumber("")).toBe(0);
    expect(toNumber("  ")).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });
  it("parses real numbers", () => {
    expect(toNumber("8.5")).toBe(8.5);
    expect(toNumber("-2")).toBe(-2);
  });
});

describe("validateForm", () => {
  it("passes a complete form", () => {
    expect(validateForm(toForm(bundle))).toEqual([]);
  });

  it("requires a positive production basis — it is a divisor", () => {
    const form = toForm(bundle);
    form.monthly_production_basis = "0";
    expect(issueFor(validateForm(form), "monthly_production_basis")).toContain("greater than 0");
  });

  it("requires a positive unit weight", () => {
    const form = toForm(bundle);
    form.rm_prices[0].purchase_unit_kg = "0";
    expect(issueFor(validateForm(form), "rm.0.purchase_unit_kg")).toContain("greater than 0");
  });

  it("rejects a negative cost", () => {
    const form = toForm(bundle);
    form.fixed_items[0].monthly_amount = "-1";
    expect(issueFor(validateForm(form), "fixed.0.monthly_amount")).toContain("negative");
  });

  it("flags an empty required field instead of silently saving 0", () => {
    const form = toForm(bundle);
    form.brick_types[0].bricks_per_batch = "";
    expect(issueFor(validateForm(form), "bt.0.bricks_per_batch")).toContain("required");
  });

  it("flags a recipe line whose material has no price row", () => {
    const form = toForm(bundle);
    form.brick_types[0].recipe.push({ rm_key: "ghost_sand", kg_per_batch: "5" });
    expect(issueFor(validateForm(form), "bt.0.recipe.1.rm_key")).toContain("ghost_sand");
  });

  it("accepts an empty sales price (not every type is priced)", () => {
    const form = toForm(bundle);
    form.brick_types[0].sales_price = "";
    expect(validateForm(form)).toEqual([]);
  });
});

describe("inr", () => {
  it("formats to 2 dp by default", () => {
    expect(inr(27.0564)).toBe("₹27.06");
  });
  it("renders a dash rather than NaN for a missing value", () => {
    expect(inr(null)).toBe("—");
    expect(inr(Number.NaN)).toBe("—");
  });
});
