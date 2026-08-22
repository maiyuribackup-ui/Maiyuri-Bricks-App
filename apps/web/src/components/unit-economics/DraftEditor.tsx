"use client";

/**
 * The working screen (PRD §7.1). Sections mirror the retiring sheet:
 * raw-material prices · per-brick-type cards · monthly fixed costs · basis.
 *
 * Everything derived re-renders as you type, because it is recomputed from the
 * form on every keystroke by computeBundle() — the same formulas the published
 * SQL views use. There is no code path that stores a derived number.
 */
import type { ComputedBundle } from "@maiyuri/shared";
import { Derived, DerivedCount, NumberField, SectionCard, TextField } from "./primitives";
import {
  inr,
  issueFor,
  type BrickTypeForm,
  type DraftForm,
  type FieldIssue,
} from "./form";

interface Props {
  form: DraftForm;
  computed: ComputedBundle;
  issues: FieldIssue[];
  onChange: (updater: (previous: DraftForm) => DraftForm) => void;
  readOnly?: boolean;
}

export function DraftEditor({ form, computed, issues, onChange, readOnly = false }: Props) {
  const costPerKg = new Map(computed.rm_prices.map((rm) => [rm.rm_key, rm.cost_per_kg]));
  const computedByType = new Map(computed.brick_types.map((bt) => [bt.brick_type, bt]));

  const setRm = (index: number, key: keyof DraftForm["rm_prices"][number], value: string) =>
    onChange((prev) => ({
      ...prev,
      rm_prices: prev.rm_prices.map((rm, i) => (i === index ? { ...rm, [key]: value } : rm)),
    }));

  const setFixed = (index: number, key: keyof DraftForm["fixed_items"][number], value: string) =>
    onChange((prev) => ({
      ...prev,
      fixed_items: prev.fixed_items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));

  const setBrick = (index: number, key: keyof BrickTypeForm, value: string) =>
    onChange((prev) => ({
      ...prev,
      brick_types: prev.brick_types.map((bt, i) => (i === index ? { ...bt, [key]: value } : bt)),
    }));

  const setRecipe = (btIndex: number, lineIndex: number, value: string) =>
    onChange((prev) => ({
      ...prev,
      brick_types: prev.brick_types.map((bt, i) =>
        i === btIndex
          ? {
              ...bt,
              recipe: bt.recipe.map((line, j) =>
                j === lineIndex ? { ...line, kg_per_batch: value } : line,
              ),
            }
          : bt,
      ),
    }));

  const addRecipeLine = (btIndex: number, rmKey: string) =>
    onChange((prev) => ({
      ...prev,
      brick_types: prev.brick_types.map((bt, i) =>
        i === btIndex ? { ...bt, recipe: [...bt.recipe, { rm_key: rmKey, kg_per_batch: "0" }] } : bt,
      ),
    }));

  const removeRecipeLine = (btIndex: number, lineIndex: number) =>
    onChange((prev) => ({
      ...prev,
      brick_types: prev.brick_types.map((bt, i) =>
        i === btIndex ? { ...bt, recipe: bt.recipe.filter((_, j) => j !== lineIndex) } : bt,
      ),
    }));

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ raw materials --- */}
      <SectionCard
        title="Raw material prices"
        subtitle="Type what you pay and what you get for it. Cost per kg is computed — it can never disagree with these two numbers."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1">Material</th>
                <th className="py-1">Purchase amount</th>
                <th className="py-1">Unit</th>
                <th className="py-1">Unit weight (kg)</th>
                <th className="py-1 text-right">Cost / kg</th>
              </tr>
            </thead>
            <tbody>
              {form.rm_prices.map((rm, i) => (
                <tr key={rm.rm_key} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    <TextField
                      value={rm.display_name}
                      onChange={(v) => setRm(i, "display_name", v)}
                      issue={issueFor(issues, `rm.${i}.display_name`)}
                    />
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{rm.rm_key}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <NumberField
                      value={rm.purchase_amount}
                      onChange={(v) => setRm(i, "purchase_amount", v)}
                      issue={issueFor(issues, `rm.${i}.purchase_amount`)}
                      disabled={readOnly}
                      suffix="₹"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <TextField
                      value={rm.purchase_unit_label}
                      onChange={(v) => setRm(i, "purchase_unit_label", v)}
                      issue={issueFor(issues, `rm.${i}.purchase_unit_label`)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <NumberField
                      value={rm.purchase_unit_kg}
                      onChange={(v) => setRm(i, "purchase_unit_kg", v)}
                      issue={issueFor(issues, `rm.${i}.purchase_unit_kg`)}
                      disabled={readOnly}
                      suffix="kg"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <span className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 font-semibold tabular-nums text-slate-700">
                      {inr(costPerKg.get(rm.rm_key) ?? 0, 4)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* --------------------------------------------------- brick types -- */}
      {form.brick_types.map((bt, i) => {
        const c = computedByType.get(bt.brick_type);
        const unusedMaterials = form.rm_prices
          .map((rm) => rm.rm_key)
          .filter((key) => !bt.recipe.some((line) => line.rm_key === key));

        return (
          <SectionCard
            key={`${bt.brick_type}-${i}`}
            title={bt.brick_type || "Untitled brick type"}
            subtitle={`Odoo match: ${bt.odoo_product_match || "—"}`}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Brick type"
                    value={bt.brick_type}
                    onChange={(v) => setBrick(i, "brick_type", v)}
                    issue={issueFor(issues, `bt.${i}.brick_type`)}
                  />
                  <TextField
                    label="Odoo product match"
                    value={bt.odoo_product_match}
                    onChange={(v) => setBrick(i, "odoo_product_match", v)}
                    issue={issueFor(issues, `bt.${i}.odoo_product_match`)}
                  />
                  <NumberField
                    label="Bricks per batch"
                    value={bt.bricks_per_batch}
                    onChange={(v) => setBrick(i, "bricks_per_batch", v)}
                    issue={issueFor(issues, `bt.${i}.bricks_per_batch`)}
                    disabled={readOnly}
                    step="0.5"
                  />
                  <NumberField
                    label="Labour ₹ / batch"
                    value={bt.labor_cost_per_batch}
                    onChange={(v) => setBrick(i, "labor_cost_per_batch", v)}
                    issue={issueFor(issues, `bt.${i}.labor_cost_per_batch`)}
                    disabled={readOnly}
                  />
                  <NumberField
                    label="Electricity ₹ / unit"
                    value={bt.electricity_per_unit}
                    onChange={(v) => setBrick(i, "electricity_per_unit", v)}
                    issue={issueFor(issues, `bt.${i}.electricity_per_unit`)}
                    disabled={readOnly}
                  />
                  <NumberField
                    label="Depreciation ₹ / unit"
                    value={bt.depreciation_per_unit}
                    onChange={(v) => setBrick(i, "depreciation_per_unit", v)}
                    issue={issueFor(issues, `bt.${i}.depreciation_per_unit`)}
                    disabled={readOnly}
                  />
                  <NumberField
                    label="Sales price ₹ / unit"
                    value={bt.sales_price}
                    onChange={(v) => setBrick(i, "sales_price", v)}
                    issue={issueFor(issues, `bt.${i}.sales_price`)}
                    disabled={readOnly}
                  />
                  <NumberField
                    label="Loading / unloading ₹"
                    value={bt.loading_unloading_per_unit}
                    onChange={(v) => setBrick(i, "loading_unloading_per_unit", v)}
                    issue={issueFor(issues, `bt.${i}.loading_unloading_per_unit`)}
                    disabled={readOnly}
                  />
                  <NumberField
                    label="Transport ₹ / unit"
                    value={bt.transport_per_unit}
                    onChange={(v) => setBrick(i, "transport_per_unit", v)}
                    issue={issueFor(issues, `bt.${i}.transport_per_unit`)}
                    disabled={readOnly}
                  />
                  <NumberField
                    label="Commission ₹ / unit"
                    value={bt.commission_per_unit}
                    onChange={(v) => setBrick(i, "commission_per_unit", v)}
                    issue={issueFor(issues, `bt.${i}.commission_per_unit`)}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Recipe — kg per batch
                  </h4>
                  <div className="space-y-1.5">
                    {bt.recipe.map((line, j) => (
                      <div key={line.rm_key} className="flex items-center gap-2">
                        <span className="w-32 shrink-0 text-sm text-slate-600">
                          {form.rm_prices.find((rm) => rm.rm_key === line.rm_key)?.display_name ??
                            line.rm_key}
                        </span>
                        <div className="w-32">
                          <NumberField
                            value={line.kg_per_batch}
                            onChange={(v) => setRecipe(i, j, v)}
                            issue={
                              issueFor(issues, `bt.${i}.recipe.${j}.kg_per_batch`) ??
                              issueFor(issues, `bt.${i}.recipe.${j}.rm_key`)
                            }
                            disabled={readOnly}
                            step="0.001"
                            suffix="kg"
                          />
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums">
                          = {inr((Number(line.kg_per_batch) || 0) * (costPerKg.get(line.rm_key) ?? 0))}{" "}
                          / batch
                        </span>
                        {readOnly ? null : (
                          <button
                            type="button"
                            onClick={() => removeRecipeLine(i, j)}
                            className="ml-auto text-xs text-red-500 hover:underline"
                          >
                            remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {readOnly || unusedMaterials.length === 0 ? null : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unusedMaterials.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => addRecipeLine(i, key)}
                          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-orange-400 hover:text-orange-600"
                        >
                          + {form.rm_prices.find((rm) => rm.rm_key === key)?.display_name ?? key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ------------------------------------------ derived ------ */}
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Computed — not editable
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Derived label="Material / batch" value={c?.material_cost_per_batch ?? 0} />
                  <Derived label="Material / unit" value={c?.material_cost_per_unit ?? 0} />
                  <Derived label="Labour / unit" value={c?.labor_cost_per_unit ?? 0} />
                  <Derived label="Overhead / unit" value={c?.overhead_per_unit ?? 0} />
                  <Derived label="Variable / unit" value={c?.variable_cost_per_unit ?? 0} />
                  <Derived label="Fixed / unit" value={c?.fixed_cost_per_unit ?? 0} />
                  <Derived label="Total cost / unit" value={c?.total_cost_per_unit ?? 0} tone="strong" />
                  <Derived
                    label="Margin / unit"
                    value={c?.margin_per_unit ?? null}
                    tone={(c?.margin_per_unit ?? 0) < 0 ? "bad" : "good"}
                    hint="Sales price − loading/unloading − transport − commission − total cost"
                  />
                  <DerivedCount label="Bricks / cement bag" value={c?.bricks_per_cement_bag ?? null} />
                </div>
                {c && c.missing_rm_keys.length > 0 ? (
                  <p className="mt-2 text-xs text-red-600">
                    Recipe uses materials with no price: {c.missing_rm_keys.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </SectionCard>
        );
      })}

      {/* ---------------------------------------------------- fixed cost -- */}
      <SectionCard
        title="Monthly fixed costs"
        subtitle="Spread evenly over the monthly production basis to give each brick its share."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {form.fixed_items.map((item, i) => (
            <div key={item.item_key} className="rounded-lg border border-slate-100 p-2">
              <TextField
                value={item.display_name}
                onChange={(v) => setFixed(i, "display_name", v)}
                issue={issueFor(issues, `fixed.${i}.display_name`)}
              />
              <div className="mt-1.5">
                <NumberField
                  value={item.monthly_amount}
                  onChange={(v) => setFixed(i, "monthly_amount", v)}
                  issue={issueFor(issues, `fixed.${i}.monthly_amount`)}
                  disabled={readOnly}
                  suffix="₹ / month"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Monthly production basis (bricks)"
            value={form.monthly_production_basis}
            onChange={(v) => onChange((prev) => ({ ...prev, monthly_production_basis: v }))}
            issue={issueFor(issues, "monthly_production_basis")}
            disabled={readOnly}
            step="100"
          />
          <Derived label="Total fixed / month" value={computed.monthly_fixed_total} />
          <Derived label="Fixed cost / unit" value={computed.fixed_cost_per_unit} tone="strong" />
        </div>
      </SectionCard>

      <SectionCard title="Notes" subtitle="Why this standard changed — shown alongside the version in history.">
        <textarea
          value={form.notes}
          onChange={(e) => onChange((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
          placeholder="e.g. Cement moved to ₹340 from the July purchase order."
        />
      </SectionCard>
    </div>
  );
}
