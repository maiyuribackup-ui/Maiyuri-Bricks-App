/**
 * Draft form model for the Standard Costs editor.
 *
 * Inputs are held as STRINGS while editing (so a field can be empty
 * mid-keystroke without becoming 0 or NaN) and converted to numbers only when
 * computing or saving. Only the fields a person types live here — every
 * derived number comes from computeBundle() in @maiyuri/shared.
 */
import type {
  StdCostBundle,
  StdCostDraftPayload,
  StdCostVersion,
} from "@maiyuri/shared";

export interface RmPriceForm {
  rm_key: string;
  display_name: string;
  purchase_amount: string;
  purchase_unit_label: string;
  purchase_unit_kg: string;
  /** In use but unconfirmed — carried through saves and publishes untouched. */
  needs_verification: boolean;
  verification_note: string;
}

export interface RecipeLineForm {
  rm_key: string;
  kg_per_batch: string;
}

export interface BrickTypeForm {
  brick_type: string;
  odoo_product_match: string;
  bricks_per_batch: string;
  labor_cost_per_batch: string;
  electricity_per_unit: string;
  depreciation_per_unit: string;
  sales_price: string;
  loading_unloading_per_unit: string;
  transport_per_unit: string;
  commission_per_unit: string;
  recipe: RecipeLineForm[];
}

export interface FixedItemForm {
  item_key: string;
  display_name: string;
  monthly_amount: string;
}

export interface DraftForm {
  version_id: string;
  monthly_production_basis: string;
  notes: string;
  rm_prices: RmPriceForm[];
  brick_types: BrickTypeForm[];
  fixed_items: FixedItemForm[];
}

const str = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

export function toForm(bundle: StdCostBundle): DraftForm {
  return {
    version_id: bundle.version.id,
    monthly_production_basis: str(bundle.version.monthly_production_basis),
    notes: bundle.version.notes ?? "",
    rm_prices: (bundle.rm_prices ?? []).map((rm) => ({
      rm_key: rm.rm_key,
      display_name: rm.display_name,
      purchase_amount: str(rm.purchase_amount),
      purchase_unit_label: rm.purchase_unit_label,
      purchase_unit_kg: str(rm.purchase_unit_kg),
      needs_verification: rm.needs_verification === true,
      verification_note: rm.verification_note ?? "",
    })),
    brick_types: (bundle.brick_types ?? []).map((bt) => ({
      brick_type: bt.brick_type,
      odoo_product_match: bt.odoo_product_match,
      bricks_per_batch: str(bt.bricks_per_batch),
      labor_cost_per_batch: str(bt.labor_cost_per_batch),
      electricity_per_unit: str(bt.electricity_per_unit),
      depreciation_per_unit: str(bt.depreciation_per_unit),
      sales_price: str(bt.sales_price),
      loading_unloading_per_unit: str(bt.loading_unloading_per_unit),
      transport_per_unit: str(bt.transport_per_unit),
      commission_per_unit: str(bt.commission_per_unit),
      recipe: (bt.recipe ?? []).map((line) => ({
        rm_key: line.rm_key,
        kg_per_batch: str(line.kg_per_batch),
      })),
    })),
    fixed_items: (bundle.fixed_items ?? []).map((item) => ({
      item_key: item.item_key,
      display_name: item.display_name,
      monthly_amount: str(item.monthly_amount),
    })),
  };
}

/** Empty or unparseable reads as 0 for computing — never NaN on screen. */
export function toNumber(value: string): number {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string): number | null {
  return value.trim() === "" ? null : toNumber(value);
}

/** Form → the shape computeBundle() and the diff understand. */
export function toBundle(form: DraftForm, version: StdCostVersion): StdCostBundle {
  return {
    version: {
      ...version,
      monthly_production_basis: toNumber(form.monthly_production_basis),
      notes: form.notes || null,
    },
    rm_prices: form.rm_prices.map((rm) => ({
      rm_key: rm.rm_key,
      display_name: rm.display_name,
      purchase_amount: toNumber(rm.purchase_amount),
      purchase_unit_label: rm.purchase_unit_label,
      purchase_unit_kg: toNumber(rm.purchase_unit_kg),
      needs_verification: rm.needs_verification,
      verification_note: rm.verification_note || null,
    })),
    brick_types: form.brick_types.map((bt, index) => ({
      brick_type: bt.brick_type,
      odoo_product_match: bt.odoo_product_match,
      bricks_per_batch: toNumber(bt.bricks_per_batch),
      labor_cost_per_batch: toNumber(bt.labor_cost_per_batch),
      electricity_per_unit: toNumber(bt.electricity_per_unit),
      depreciation_per_unit: toNumber(bt.depreciation_per_unit),
      sales_price: toNullableNumber(bt.sales_price),
      loading_unloading_per_unit: toNumber(bt.loading_unloading_per_unit),
      transport_per_unit: toNumber(bt.transport_per_unit),
      commission_per_unit: toNumber(bt.commission_per_unit),
      sort_order: index,
      recipe: bt.recipe.map((line) => ({
        rm_key: line.rm_key,
        kg_per_batch: toNumber(line.kg_per_batch),
      })),
    })),
    fixed_items: form.fixed_items.map((item) => ({
      item_key: item.item_key,
      display_name: item.display_name,
      monthly_amount: toNumber(item.monthly_amount),
    })),
  };
}

/** Form → the PUT body. */
export function toPayload(form: DraftForm, version: StdCostVersion): StdCostDraftPayload {
  const bundle = toBundle(form, version);
  return {
    version_id: form.version_id,
    monthly_production_basis: Math.round(toNumber(form.monthly_production_basis)),
    notes: form.notes || null,
    rm_prices: bundle.rm_prices,
    brick_types: bundle.brick_types,
    fixed_items: bundle.fixed_items,
  };
}

export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Inline validation — the same rules the CHECK constraints enforce, said in
 * words at the field instead of as a Postgres error after saving.
 */
export function validateForm(form: DraftForm): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const require = (path: string, value: string, label: string, rule: "positive" | "non_negative") => {
    if (value.trim() === "") {
      issues.push({ path, message: `${label} is required` });
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      issues.push({ path, message: `${label} must be a number` });
    } else if (rule === "positive" && parsed <= 0) {
      issues.push({ path, message: `${label} must be greater than 0` });
    } else if (rule === "non_negative" && parsed < 0) {
      issues.push({ path, message: `${label} cannot be negative` });
    }
  };

  require("monthly_production_basis", form.monthly_production_basis, "Monthly production basis", "positive");

  form.rm_prices.forEach((rm, i) => {
    if (!rm.display_name.trim()) issues.push({ path: `rm.${i}.display_name`, message: "Name is required" });
    require(`rm.${i}.purchase_amount`, rm.purchase_amount, "Purchase amount", "non_negative");
    require(`rm.${i}.purchase_unit_kg`, rm.purchase_unit_kg, "Unit weight (kg)", "positive");
    if (!rm.purchase_unit_label.trim()) {
      issues.push({ path: `rm.${i}.purchase_unit_label`, message: "Unit label is required" });
    }
  });

  form.fixed_items.forEach((item, i) => {
    if (!item.display_name.trim()) issues.push({ path: `fixed.${i}.display_name`, message: "Name is required" });
    require(`fixed.${i}.monthly_amount`, item.monthly_amount, "Monthly amount", "non_negative");
  });

  const knownRmKeys = new Set(form.rm_prices.map((rm) => rm.rm_key));
  form.brick_types.forEach((bt, i) => {
    if (!bt.brick_type.trim()) issues.push({ path: `bt.${i}.brick_type`, message: "Brick type is required" });
    if (!bt.odoo_product_match.trim()) {
      issues.push({ path: `bt.${i}.odoo_product_match`, message: "Odoo product match is required" });
    }
    require(`bt.${i}.bricks_per_batch`, bt.bricks_per_batch, "Bricks per batch", "positive");
    require(`bt.${i}.labor_cost_per_batch`, bt.labor_cost_per_batch, "Labour per batch", "non_negative");
    require(`bt.${i}.electricity_per_unit`, bt.electricity_per_unit, "Electricity per unit", "non_negative");
    require(`bt.${i}.depreciation_per_unit`, bt.depreciation_per_unit, "Depreciation per unit", "non_negative");
    require(`bt.${i}.loading_unloading_per_unit`, bt.loading_unloading_per_unit, "Loading / unloading", "non_negative");
    require(`bt.${i}.transport_per_unit`, bt.transport_per_unit, "Transport", "non_negative");
    require(`bt.${i}.commission_per_unit`, bt.commission_per_unit, "Commission", "non_negative");
    if (bt.sales_price.trim() !== "") {
      require(`bt.${i}.sales_price`, bt.sales_price, "Sales price", "non_negative");
    }
    bt.recipe.forEach((line, j) => {
      require(`bt.${i}.recipe.${j}.kg_per_batch`, line.kg_per_batch, "Kg per batch", "non_negative");
      if (!knownRmKeys.has(line.rm_key)) {
        issues.push({
          path: `bt.${i}.recipe.${j}.rm_key`,
          message: `No price row for "${line.rm_key}"`,
        });
      }
    });
  });

  return issues;
}

/** Look up the message for one field so it can render under the input. */
export function issueFor(issues: FieldIssue[], path: string): string | null {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}

/** ₹ formatting for display only — the underlying value keeps full precision. */
export function inr(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}
