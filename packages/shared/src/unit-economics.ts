// @maiyuri/shared - Unit Economics (standard cost) types, schemas and the
// single TypeScript source of truth for every derived number.
//
// This mirrors, formula for formula, the SQL in
// supabase/migrations/20260822120000_std_cost_unit_economics.sql
// (view v_std_cost_brick_type_computed). The editor needs live numbers for a
// draft that has not been saved yet, which SQL cannot give it — so the formula
// exists twice, and unit-economics.test.ts pins both to the same expected
// values so they can never drift apart silently.
//
// The rule that makes the "chemical shows ₹80/kg while its own inputs say ₹74"
// class of error impossible: nothing below is ever stored from user input.

import { z } from "zod";

export type StdCostVersionStatus = "draft" | "published" | "archived";

/** The six raw materials the standard is built from (extensible). */
export const STD_COST_RM_KEYS = [
  "cement",
  "chemical",
  "msand_dust",
  "msand_waste",
  "red_soil",
  "red_soil_gravel",
] as const;

export interface StdCostVersion {
  id: string;
  status: StdCostVersionStatus;
  valid_from: string | null;
  monthly_production_basis: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  published_by: string | null;
  published_at: string | null;
}

export interface StdCostRmPrice {
  id?: string;
  rm_key: string;
  display_name: string;
  purchase_amount: number;
  purchase_unit_label: string;
  purchase_unit_kg: number;
}

export interface StdCostRecipeLine {
  rm_key: string;
  kg_per_batch: number;
}

export interface StdCostBrickType {
  id?: string;
  brick_type: string;
  odoo_product_match: string;
  bricks_per_batch: number;
  labor_cost_per_batch: number;
  electricity_per_unit: number;
  depreciation_per_unit: number;
  sales_price: number | null;
  loading_unloading_per_unit: number;
  transport_per_unit: number;
  commission_per_unit: number;
  sort_order?: number;
  recipe: StdCostRecipeLine[];
}

export interface StdCostFixedItem {
  id?: string;
  item_key: string;
  display_name: string;
  monthly_amount: number;
}

/** A published version as the History list shows it. */
export interface StdCostVersionSummary extends StdCostVersion {
  published_by_name: string | null;
}

/** Everything that makes up one version — what the editor loads and saves. */
export interface StdCostBundle {
  version: StdCostVersion;
  rm_prices: StdCostRmPrice[];
  brick_types: StdCostBrickType[];
  fixed_items: StdCostFixedItem[];
}

// --------------------------------------------------------------- computed --

export interface ComputedRmPrice extends StdCostRmPrice {
  /** purchase_amount / purchase_unit_kg — never typed, always derived. */
  cost_per_kg: number;
}

export interface ComputedBrickType {
  brick_type: string;
  odoo_product_match: string;
  bricks_per_batch: number;
  sales_price: number | null;
  material_cost_per_batch: number;
  material_cost_per_unit: number;
  labor_cost_per_batch: number;
  labor_cost_per_unit: number;
  overhead_per_unit: number;
  variable_cost_per_unit: number;
  fixed_cost_per_unit: number;
  total_cost_per_unit: number;
  margin_per_unit: number | null;
  bricks_per_cement_bag: number | null;
  /** Recipe lines whose rm_key has no price row in this version. */
  missing_rm_keys: string[];
}

export interface ComputedBundle {
  monthly_fixed_total: number;
  monthly_production_basis: number;
  fixed_cost_per_unit: number;
  rm_prices: ComputedRmPrice[];
  brick_types: ComputedBrickType[];
}

/** Raw-material cost per kg. Zero-safe: an unusable unit weight yields 0. */
export function computeRmCostPerKg(rm: {
  purchase_amount: number;
  purchase_unit_kg: number;
}): number {
  const kg = rm.purchase_unit_kg ?? 0;
  if (!(kg > 0)) return 0;
  return (rm.purchase_amount ?? 0) / kg;
}

/**
 * Compute every derived number for a version. Full precision throughout —
 * round only at display (`roundMoney`) or in the contract views.
 */
export function computeBundle(bundle: StdCostBundle): ComputedBundle {
  const basis = bundle.version?.monthly_production_basis ?? 0;
  const monthlyFixedTotal = (bundle.fixed_items ?? []).reduce(
    (sum, item) => sum + (item.monthly_amount ?? 0),
    0,
  );
  const fixedCostPerUnit = basis > 0 ? monthlyFixedTotal / basis : 0;

  const rmPrices: ComputedRmPrice[] = (bundle.rm_prices ?? []).map((rm) => ({
    ...rm,
    cost_per_kg: computeRmCostPerKg(rm),
  }));
  const costPerKgByKey = new Map(rmPrices.map((rm) => [rm.rm_key, rm.cost_per_kg]));

  const brickTypes = (bundle.brick_types ?? []).map((bt) =>
    computeBrickType(bt, costPerKgByKey, fixedCostPerUnit),
  );

  return {
    monthly_fixed_total: monthlyFixedTotal,
    monthly_production_basis: basis,
    fixed_cost_per_unit: fixedCostPerUnit,
    rm_prices: rmPrices,
    brick_types: brickTypes,
  };
}

function computeBrickType(
  bt: StdCostBrickType,
  costPerKgByKey: Map<string, number>,
  fixedCostPerUnit: number,
): ComputedBrickType {
  const perBatch = bt.bricks_per_batch ?? 0;
  const recipe = bt.recipe ?? [];

  const missing = recipe
    .filter((line) => !costPerKgByKey.has(line.rm_key))
    .map((line) => line.rm_key);

  const materialPerBatch = recipe.reduce(
    (sum, line) => sum + (line.kg_per_batch ?? 0) * (costPerKgByKey.get(line.rm_key) ?? 0),
    0,
  );

  // A batch that makes no bricks has no per-unit cost; guard rather than divide.
  const safeDivide = (value: number) => (perBatch > 0 ? value / perBatch : 0);

  const materialPerUnit = safeDivide(materialPerBatch);
  const laborPerUnit = safeDivide(bt.labor_cost_per_batch ?? 0);
  const overheadPerUnit = (bt.electricity_per_unit ?? 0) + (bt.depreciation_per_unit ?? 0);
  const variablePerUnit = materialPerUnit + laborPerUnit + overheadPerUnit;
  const totalPerUnit = variablePerUnit + fixedCostPerUnit;

  const salesPrice = bt.sales_price ?? null;
  const marginPerUnit =
    salesPrice === null
      ? null
      : salesPrice -
        (bt.loading_unloading_per_unit ?? 0) -
        (bt.transport_per_unit ?? 0) -
        (bt.commission_per_unit ?? 0) -
        totalPerUnit;

  const cementKg = recipe.find((line) => line.rm_key === "cement")?.kg_per_batch ?? 0;

  return {
    brick_type: bt.brick_type,
    odoo_product_match: bt.odoo_product_match,
    bricks_per_batch: perBatch,
    sales_price: salesPrice,
    material_cost_per_batch: materialPerBatch,
    material_cost_per_unit: materialPerUnit,
    labor_cost_per_batch: bt.labor_cost_per_batch ?? 0,
    labor_cost_per_unit: laborPerUnit,
    overhead_per_unit: overheadPerUnit,
    variable_cost_per_unit: variablePerUnit,
    fixed_cost_per_unit: fixedCostPerUnit,
    total_cost_per_unit: totalPerUnit,
    margin_per_unit: marginPerUnit,
    bricks_per_cement_bag: cementKg > 0 ? (perBatch * 50) / cementKg : null,
    missing_rm_keys: missing,
  };
}

/** Display rounding — 2 dp, and never "-0.00". */
export function roundMoney(value: number | null | undefined, dp = 2): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  const factor = 10 ** dp;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

// ------------------------------------------------------- publish gatekeeping

export interface PublishBlocker {
  brick_type: string | null;
  message: string;
}

export interface PublishWarning {
  label: string;
  previous: number;
  next: number;
  change_pct: number;
}

/** A total moving more than this vs the published standard is worth a look. */
export const STD_COST_WARN_THRESHOLD_PCT = 15;

/**
 * Hard blockers (PRD §7): no brick type may lack a cement recipe line, and no
 * total cost may be zero or negative — both mean the inputs are wrong, and a
 * published version cannot be edited afterwards.
 */
export function publishBlockers(bundle: StdCostBundle): PublishBlocker[] {
  const computed = computeBundle(bundle);
  const blockers: PublishBlocker[] = [];

  if (computed.brick_types.length === 0) {
    blockers.push({ brick_type: null, message: "No brick types defined" });
  }
  if (!(computed.monthly_production_basis > 0)) {
    blockers.push({ brick_type: null, message: "Monthly production basis must be greater than 0" });
  }

  for (const bt of bundle.brick_types ?? []) {
    const cement = (bt.recipe ?? []).find((line) => line.rm_key === "cement");
    if (!cement || !(cement.kg_per_batch > 0)) {
      blockers.push({
        brick_type: bt.brick_type,
        message: "No cement in the recipe — every brick type must consume cement",
      });
    }
  }

  for (const bt of computed.brick_types) {
    if (!(bt.total_cost_per_unit > 0)) {
      blockers.push({
        brick_type: bt.brick_type,
        message: `Total cost per unit is ${roundMoney(bt.total_cost_per_unit)} — must be greater than 0`,
      });
    }
    if (bt.missing_rm_keys.length > 0) {
      blockers.push({
        brick_type: bt.brick_type,
        message: `Recipe uses raw materials with no price: ${bt.missing_rm_keys.join(", ")}`,
      });
    }
  }

  return blockers;
}

/** Non-blocking: totals that moved more than 15% vs the published version. */
export function publishWarnings(
  draft: StdCostBundle,
  published: StdCostBundle | null,
): PublishWarning[] {
  if (!published) return [];
  const next = computeBundle(draft);
  const previous = computeBundle(published);
  const previousByType = new Map(previous.brick_types.map((bt) => [bt.brick_type, bt]));

  const warnings: PublishWarning[] = [];
  for (const bt of next.brick_types) {
    const before = previousByType.get(bt.brick_type);
    if (!before || !(before.total_cost_per_unit > 0)) continue;
    const changePct =
      ((bt.total_cost_per_unit - before.total_cost_per_unit) / before.total_cost_per_unit) * 100;
    if (Math.abs(changePct) > STD_COST_WARN_THRESHOLD_PCT) {
      warnings.push({
        label: `${bt.brick_type} total cost/unit`,
        previous: roundMoney(before.total_cost_per_unit),
        next: roundMoney(bt.total_cost_per_unit),
        change_pct: roundMoney(changePct, 1),
      });
    }
  }
  return warnings;
}

// -------------------------------------------------------------------- diff --

export interface StdCostDiffRow {
  section: "version" | "raw_material" | "brick_type" | "recipe" | "fixed_cost" | "computed";
  group: string;
  label: string;
  before: number | string | null;
  after: number | string | null;
}

function pushDiff(
  rows: StdCostDiffRow[],
  section: StdCostDiffRow["section"],
  group: string,
  label: string,
  before: number | string | null | undefined,
  after: number | string | null | undefined,
) {
  const a = before ?? null;
  const b = after ?? null;
  if (typeof a === "number" && typeof b === "number") {
    if (roundMoney(a, 4) === roundMoney(b, 4)) return;
  } else if (a === b) {
    return;
  }
  rows.push({ section, group, label, before: a, after: b });
}

/**
 * Number-by-number diff between two versions — "what changed between v3 and
 * v4". Covers inputs AND the resulting computed totals, since the totals are
 * what anyone downstream actually feels.
 */
export function diffBundles(before: StdCostBundle | null, after: StdCostBundle): StdCostDiffRow[] {
  const rows: StdCostDiffRow[] = [];
  if (!before) return rows;

  pushDiff(rows, "version", "Version", "Monthly production basis",
    before.version.monthly_production_basis, after.version.monthly_production_basis);

  // raw materials
  const beforeRm = new Map((before.rm_prices ?? []).map((rm) => [rm.rm_key, rm]));
  const afterRm = new Map((after.rm_prices ?? []).map((rm) => [rm.rm_key, rm]));
  for (const key of unionKeys(beforeRm, afterRm)) {
    const a = beforeRm.get(key);
    const b = afterRm.get(key);
    const group = b?.display_name ?? a?.display_name ?? key;
    pushDiff(rows, "raw_material", group, "Purchase amount", a?.purchase_amount ?? null, b?.purchase_amount ?? null);
    pushDiff(rows, "raw_material", group, "Purchase unit (kg)", a?.purchase_unit_kg ?? null, b?.purchase_unit_kg ?? null);
    pushDiff(rows, "raw_material", group, "Unit label", a?.purchase_unit_label ?? null, b?.purchase_unit_label ?? null);
    pushDiff(rows, "raw_material", group, "Cost / kg",
      a ? roundMoney(computeRmCostPerKg(a), 4) : null,
      b ? roundMoney(computeRmCostPerKg(b), 4) : null);
  }

  // fixed costs
  const beforeFixed = new Map((before.fixed_items ?? []).map((f) => [f.item_key, f]));
  const afterFixed = new Map((after.fixed_items ?? []).map((f) => [f.item_key, f]));
  for (const key of unionKeys(beforeFixed, afterFixed)) {
    const a = beforeFixed.get(key);
    const b = afterFixed.get(key);
    pushDiff(rows, "fixed_cost", b?.display_name ?? a?.display_name ?? key, "Monthly amount",
      a?.monthly_amount ?? null, b?.monthly_amount ?? null);
  }

  // brick types + recipes
  const beforeBt = new Map((before.brick_types ?? []).map((bt) => [bt.brick_type, bt]));
  const afterBt = new Map((after.brick_types ?? []).map((bt) => [bt.brick_type, bt]));
  for (const key of unionKeys(beforeBt, afterBt)) {
    const a = beforeBt.get(key);
    const b = afterBt.get(key);
    pushDiff(rows, "brick_type", key, "Odoo product match", a?.odoo_product_match ?? null, b?.odoo_product_match ?? null);
    pushDiff(rows, "brick_type", key, "Bricks / batch", a?.bricks_per_batch ?? null, b?.bricks_per_batch ?? null);
    pushDiff(rows, "brick_type", key, "Labour / batch", a?.labor_cost_per_batch ?? null, b?.labor_cost_per_batch ?? null);
    pushDiff(rows, "brick_type", key, "Electricity / unit", a?.electricity_per_unit ?? null, b?.electricity_per_unit ?? null);
    pushDiff(rows, "brick_type", key, "Depreciation / unit", a?.depreciation_per_unit ?? null, b?.depreciation_per_unit ?? null);
    pushDiff(rows, "brick_type", key, "Sales price", a?.sales_price ?? null, b?.sales_price ?? null);
    pushDiff(rows, "brick_type", key, "Loading / unloading", a?.loading_unloading_per_unit ?? null, b?.loading_unloading_per_unit ?? null);
    pushDiff(rows, "brick_type", key, "Transport / unit", a?.transport_per_unit ?? null, b?.transport_per_unit ?? null);
    pushDiff(rows, "brick_type", key, "Commission / unit", a?.commission_per_unit ?? null, b?.commission_per_unit ?? null);

    const aRecipe = new Map((a?.recipe ?? []).map((line) => [line.rm_key, line.kg_per_batch]));
    const bRecipe = new Map((b?.recipe ?? []).map((line) => [line.rm_key, line.kg_per_batch]));
    for (const rmKey of unionKeys(aRecipe, bRecipe)) {
      pushDiff(rows, "recipe", key, `${rmKey} kg / batch`,
        aRecipe.get(rmKey) ?? null, bRecipe.get(rmKey) ?? null);
    }
  }

  // computed totals — the part everyone downstream feels
  const beforeComputed = new Map(computeBundle(before).brick_types.map((bt) => [bt.brick_type, bt]));
  const afterComputed = new Map(computeBundle(after).brick_types.map((bt) => [bt.brick_type, bt]));
  for (const key of unionKeys(beforeComputed, afterComputed)) {
    const a = beforeComputed.get(key);
    const b = afterComputed.get(key);
    pushDiff(rows, "computed", key, "Variable cost / unit",
      a ? roundMoney(a.variable_cost_per_unit) : null, b ? roundMoney(b.variable_cost_per_unit) : null);
    pushDiff(rows, "computed", key, "Fixed cost / unit",
      a ? roundMoney(a.fixed_cost_per_unit) : null, b ? roundMoney(b.fixed_cost_per_unit) : null);
    pushDiff(rows, "computed", key, "Total cost / unit",
      a ? roundMoney(a.total_cost_per_unit) : null, b ? roundMoney(b.total_cost_per_unit) : null);
    pushDiff(rows, "computed", key, "Margin / unit",
      a?.margin_per_unit === null || a === undefined ? null : roundMoney(a.margin_per_unit),
      b?.margin_per_unit === null || b === undefined ? null : roundMoney(b.margin_per_unit));
  }

  return rows;
}

function unionKeys<V>(a: Map<string, V>, b: Map<string, V>): string[] {
  return Array.from(new Set([...a.keys(), ...b.keys()]));
}

// ----------------------------------------------------------------- schemas --

export const stdCostRmPriceSchema = z.object({
  rm_key: z.string().min(1).max(64),
  display_name: z.string().min(1).max(120),
  purchase_amount: z.number().min(0).finite(),
  purchase_unit_label: z.string().min(1).max(120),
  purchase_unit_kg: z.number().positive().finite(),
});

export const stdCostRecipeLineSchema = z.object({
  rm_key: z.string().min(1).max(64),
  kg_per_batch: z.number().min(0).finite(),
});

export const stdCostBrickTypeSchema = z.object({
  brick_type: z.string().min(1).max(64),
  odoo_product_match: z.string().min(1).max(200),
  bricks_per_batch: z.number().positive().finite(),
  labor_cost_per_batch: z.number().min(0).finite(),
  electricity_per_unit: z.number().min(0).finite(),
  depreciation_per_unit: z.number().min(0).finite(),
  sales_price: z.number().min(0).finite().nullable(),
  loading_unloading_per_unit: z.number().min(0).finite(),
  transport_per_unit: z.number().min(0).finite(),
  commission_per_unit: z.number().min(0).finite(),
  sort_order: z.number().int().min(0).optional(),
  recipe: z.array(stdCostRecipeLineSchema).max(40),
});

export const stdCostFixedItemSchema = z.object({
  item_key: z.string().min(1).max(64),
  display_name: z.string().min(1).max(120),
  monthly_amount: z.number().min(0).finite(),
});

/** Body of PUT /api/unit-economics/draft — the whole draft, replace-all. */
export const stdCostDraftSchema = z.object({
  version_id: z.string().uuid(),
  monthly_production_basis: z.number().int().positive().max(10_000_000),
  notes: z.string().max(2000).nullable().optional(),
  rm_prices: z.array(stdCostRmPriceSchema).max(50),
  brick_types: z.array(stdCostBrickTypeSchema).max(50),
  fixed_items: z.array(stdCostFixedItemSchema).max(50),
});

export type StdCostDraftPayload = z.infer<typeof stdCostDraftSchema>;

export const stdCostPublishSchema = z.object({
  version_id: z.string().uuid(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "valid_from must be YYYY-MM-DD"),
  notes: z.string().max(2000).nullable().optional(),
});
