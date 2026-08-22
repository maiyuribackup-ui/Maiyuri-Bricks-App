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
  /**
   * This input is in use but unconfirmed (e.g. a load weight nobody has
   * weighed). It changes nothing about how the number is used — it records
   * doubt so it can be chased, and so nobody "fixes" a variance by editing a
   * formula instead of confirming the input.
   */
  needs_verification?: boolean;
  verification_note?: string | null;
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
  needs_verification: z.boolean().optional(),
  verification_note: z.string().max(1000).nullable().optional(),
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

// ==========================================================================
// Reference (benchmark) costs — legacy sheet totals, manual benchmarks, past
// actuals. Stored SEPARATELY from the standard and never fed back into it.
//
// The whole point: the computed cost is what the recipes and prices say, full
// stop. A reference is a second opinion recorded next to it. The only
// operation defined between them is subtraction, and the residual is reported
// as UNEXPLAINED rather than absorbed. There is deliberately no code path here
// that lets a reference influence computeBundle().
//
// Mirrors the SQL views v_std_cost_reference_variance and
// v_std_cost_reference_component_variance.
// ==========================================================================

export type StdCostReferenceSource =
  | "legacy_excel"
  | "manual_benchmark"
  | "historical_actual"
  | "competitor"
  | "other";

export const STD_COST_REFERENCE_SOURCES: {
  value: StdCostReferenceSource;
  label: string;
}[] = [
  { value: "legacy_excel", label: "Legacy Excel" },
  { value: "manual_benchmark", label: "Manual Benchmark" },
  { value: "historical_actual", label: "Historical Actual" },
  { value: "competitor", label: "Competitor" },
  { value: "other", label: "Other" },
];

/**
 * Cost elements are mutually exclusive and sum to the reference total; each
 * maps 1:1 onto a computed number, which is what makes the residual meaningful.
 */
export type StdCostElementKey =
  | "material"
  | "labour"
  | "electricity"
  | "depreciation"
  | "fixed"
  | "other";

export const STD_COST_ELEMENT_KEYS: StdCostElementKey[] = [
  "material",
  "labour",
  "electricity",
  "depreciation",
  "fixed",
  "other",
];

export const STD_COST_ELEMENT_LABELS: Record<StdCostElementKey, string> = {
  material: "Raw material",
  labour: "Labour",
  electricity: "Electricity",
  depreciation: "Depreciation",
  fixed: "Fixed overhead",
  other: "Other",
};

export interface StdCostReferenceComponent {
  id?: string;
  /**
   * 'cost_element' rows are the exclusive breakdown of the total.
   * 'raw_material' rows drill down INSIDE the material element (cement,
   * chemical, …) and are never added to the cost_element sum — doing so would
   * double-count material.
   */
  component_kind: "cost_element" | "raw_material";
  component_key: string;
  amount: number;
}

export interface StdCostReference {
  id?: string;
  brick_type: string;
  reference_cost: number;
  source: StdCostReferenceSource;
  source_label: string | null;
  reference_date: string;
  notes: string | null;
  is_active: boolean;
  components: StdCostReferenceComponent[];
}

export interface StdCostComponentVariance {
  component_kind: "cost_element" | "raw_material";
  component_key: string;
  label: string;
  reference_amount: number;
  /** null where the reference component has no computed counterpart. */
  computed_amount: number | null;
  difference: number | null;
}

export interface StdCostReferenceVariance {
  reference_id: string | null;
  brick_type: string;
  source: StdCostReferenceSource;
  source_label: string | null;
  reference_date: string;
  notes: string | null;
  computed_cost_per_unit: number;
  reference_cost: number;
  /** computed − reference. Negative means the standard is below the benchmark. */
  variance_amount: number;
  variance_pct: number | null;
  is_significant: boolean;
  has_component_breakdown: boolean;
  /** Σ of cost_element differences — the part the breakdown accounts for. */
  explained_difference: number;
  /** What no stored component explains. The whole variance when there is no breakdown. */
  unexplained_difference: number;
  cost_elements: StdCostComponentVariance[];
  raw_materials: StdCostComponentVariance[];
}

/** A variance beyond this deserves a flag on screen. */
export const STD_COST_VARIANCE_SIGNIFICANT_PCT = 10;

/**
 * Reconcile one computed brick type against one reference.
 *
 * `perUnitByRmKey` supplies the per-unit cost of each raw material for the
 * raw_material drill-down; pass an empty map to skip that axis.
 */
export function computeReferenceVariance(
  computed: ComputedBrickType,
  reference: StdCostReference,
  options?: {
    electricityPerUnit?: number;
    depreciationPerUnit?: number;
    perUnitByRmKey?: Map<string, number>;
  },
): StdCostReferenceVariance {
  const computedByElement: Record<StdCostElementKey, number | null> = {
    material: computed.material_cost_per_unit,
    labour: computed.labor_cost_per_unit,
    electricity: options?.electricityPerUnit ?? null,
    depreciation: options?.depreciationPerUnit ?? null,
    fixed: computed.fixed_cost_per_unit,
    // 'other' has no computed counterpart by definition — leaving it null keeps
    // it visible as unmatched instead of reading as a zero difference.
    other: null,
  };

  const components = reference.components ?? [];

  const costElements: StdCostComponentVariance[] = components
    .filter((component) => component.component_kind === "cost_element")
    .map((component) => {
      const key = component.component_key as StdCostElementKey;
      const computedAmount = computedByElement[key] ?? null;
      return {
        component_kind: "cost_element" as const,
        component_key: key,
        label: STD_COST_ELEMENT_LABELS[key] ?? key,
        reference_amount: component.amount,
        computed_amount: computedAmount,
        difference: computedAmount === null ? null : computedAmount - component.amount,
      };
    });

  const perUnitByRmKey = options?.perUnitByRmKey ?? new Map<string, number>();
  const rawMaterials: StdCostComponentVariance[] = components
    .filter((component) => component.component_kind === "raw_material")
    .map((component) => {
      const computedAmount = perUnitByRmKey.get(component.component_key) ?? 0;
      return {
        component_kind: "raw_material" as const,
        component_key: component.component_key,
        label: component.component_key,
        reference_amount: component.amount,
        computed_amount: computedAmount,
        difference: computedAmount - component.amount,
      };
    });

  const varianceAmount = computed.total_cost_per_unit - reference.reference_cost;
  const explained = costElements.reduce((sum, row) => sum + (row.difference ?? 0), 0);
  const variancePct =
    reference.reference_cost > 0 ? (varianceAmount / reference.reference_cost) * 100 : null;

  return {
    reference_id: reference.id ?? null,
    brick_type: reference.brick_type,
    source: reference.source,
    source_label: reference.source_label,
    reference_date: reference.reference_date,
    notes: reference.notes,
    computed_cost_per_unit: roundMoney(computed.total_cost_per_unit),
    reference_cost: reference.reference_cost,
    variance_amount: roundMoney(varianceAmount),
    variance_pct: variancePct === null ? null : roundMoney(variancePct, 1),
    is_significant:
      variancePct !== null && Math.abs(variancePct) > STD_COST_VARIANCE_SIGNIFICANT_PCT,
    has_component_breakdown: components.length > 0,
    explained_difference: roundMoney(explained),
    // No breakdown → the whole variance is unexplained. That is the honest
    // answer, and it is what makes a missing breakdown visible rather than
    // looking like a reconciled zero.
    unexplained_difference: roundMoney(varianceAmount - explained),
    cost_elements: costElements,
    raw_materials: rawMaterials,
  };
}

/**
 * Per-unit cost of each raw material in a brick type's recipe — the input for
 * the raw_material drill-down (e.g. "cement differs by ₹0.62").
 */
export function perUnitCostByRmKey(
  brickType: StdCostBrickType,
  rmPrices: StdCostRmPrice[],
): Map<string, number> {
  const costPerKg = new Map(rmPrices.map((rm) => [rm.rm_key, computeRmCostPerKg(rm)]));
  const perBatch = brickType.bricks_per_batch ?? 0;
  const result = new Map<string, number>();
  if (!(perBatch > 0)) return result;
  for (const line of brickType.recipe ?? []) {
    result.set(
      line.rm_key,
      ((line.kg_per_batch ?? 0) * (costPerKg.get(line.rm_key) ?? 0)) / perBatch,
    );
  }
  return result;
}

/** Reconcile a whole version against every active reference for its brick types. */
export function computeAllReferenceVariances(
  bundle: StdCostBundle,
  references: StdCostReference[],
): StdCostReferenceVariance[] {
  const computed = computeBundle(bundle);
  const computedByType = new Map(computed.brick_types.map((bt) => [bt.brick_type, bt]));
  const inputByType = new Map((bundle.brick_types ?? []).map((bt) => [bt.brick_type, bt]));

  return (references ?? [])
    .filter((reference) => reference.is_active && computedByType.has(reference.brick_type))
    .map((reference) => {
      const computedBrickType = computedByType.get(reference.brick_type);
      const input = inputByType.get(reference.brick_type);
      if (!computedBrickType) throw new Error(`No computed brick type ${reference.brick_type}`);
      return computeReferenceVariance(computedBrickType, reference, {
        electricityPerUnit: input?.electricity_per_unit,
        depreciationPerUnit: input?.depreciation_per_unit,
        perUnitByRmKey: input ? perUnitCostByRmKey(input, bundle.rm_prices ?? []) : undefined,
      });
    });
}

// ------------------------------------------------------- reference schemas --

export const stdCostReferenceComponentSchema = z.object({
  component_kind: z.enum(["cost_element", "raw_material"]),
  component_key: z.string().min(1).max(64),
  amount: z.number().min(0).finite(),
});

export const stdCostReferenceSchema = z
  .object({
    id: z.string().uuid().optional(),
    brick_type: z.string().min(1).max(64),
    reference_cost: z.number().min(0).finite(),
    source: z.enum([
      "legacy_excel",
      "manual_benchmark",
      "historical_actual",
      "competitor",
      "other",
    ]),
    source_label: z.string().max(200).nullable().optional(),
    reference_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "reference_date must be YYYY-MM-DD"),
    notes: z.string().max(2000).nullable().optional(),
    is_active: z.boolean().optional(),
    components: z.array(stdCostReferenceComponentSchema).max(40).optional(),
  })
  .superRefine((value, ctx) => {
    // A cost_element breakdown claims to BE the total. If it does not add up,
    // the residual it produces would be meaningless — so refuse it here rather
    // than let it quietly distort every variance downstream.
    const elements = (value.components ?? []).filter(
      (component) => component.component_kind === "cost_element",
    );
    if (elements.length === 0) return;
    const sum = elements.reduce((total, component) => total + component.amount, 0);
    if (Math.abs(sum - value.reference_cost) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["components"],
        message: `Cost element breakdown adds up to ${sum.toFixed(2)}, but the reference cost is ${value.reference_cost.toFixed(2)}`,
      });
    }
    // cost_element keys are a closed set (the DB CHECKs it too) — catch it
    // here so the API answers with a field message, not a constraint error.
    for (const component of elements) {
      if (!STD_COST_ELEMENT_KEYS.includes(component.component_key as StdCostElementKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: `Unknown cost element "${component.component_key}" — expected one of ${STD_COST_ELEMENT_KEYS.join(", ")}`,
        });
      }
    }

    const seen = new Set<string>();
    for (const component of value.components ?? []) {
      const key = `${component.component_kind}:${component.component_key}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: `Duplicate component: ${component.component_key}`,
        });
      }
      seen.add(key);
    }
  });

export type StdCostReferencePayload = z.infer<typeof stdCostReferenceSchema>;
