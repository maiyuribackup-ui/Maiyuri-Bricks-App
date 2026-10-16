"use client";

/**
 * Cost Reconciliation — computed standard vs stored benchmarks.
 *
 * This screen only ever SHOWS a difference. There is no control here that
 * changes a computed cost, because the way to move a computed cost is to
 * correct a business input in the draft and publish it. A variance is a
 * question to answer, not a number to close.
 */
import { useState } from "react";
import {
  STD_COST_BREAKDOWN_TOLERANCE,
  STD_COST_ELEMENT_KEYS,
  STD_COST_ELEMENT_LABELS,
  STD_COST_REFERENCE_SOURCES,
  type StdCostBreakdownStatus,
  type StdCostComponentVariance,
  type StdCostReference,
  type StdCostReferenceVariance,
} from "@maiyuri/shared";
import { SectionCard } from "./primitives";
import { inr } from "./form";

const sourceLabel = (source: string) =>
  STD_COST_REFERENCE_SOURCES.find((entry) => entry.value === source)?.label ?? source;

function VarianceHeadline({ variance }: { variance: StdCostReferenceVariance }) {
  const below = variance.variance_amount < 0;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg bg-slate-900 px-3 py-2 text-white">
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">
          Computed cost
        </div>
        <div className="text-base font-semibold tabular-nums">
          {inr(variance.computed_cost_per_unit)}
        </div>
      </div>
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">
          {sourceLabel(variance.source)}
        </div>
        <div className="text-base font-semibold tabular-nums">{inr(variance.reference_cost)}</div>
      </div>
      <div
        className={`rounded-lg px-3 py-2 ${
          variance.is_significant
            ? "bg-amber-100 text-amber-900"
            : below
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-100 text-slate-700"
        }`}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">Variance</div>
        <div className="text-base font-semibold tabular-nums">
          {variance.variance_amount < 0 ? "−" : "+"}
          {inr(Math.abs(variance.variance_amount))}
          {variance.variance_pct === null
            ? ""
            : ` (${variance.variance_pct > 0 ? "+" : ""}${variance.variance_pct}%)`}
        </div>
      </div>
    </div>
  );
}

function ComponentRows({
  title,
  rows,
  note,
}: {
  title: string;
  rows: StdCostComponentVariance[];
  note?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {note ? <p className="mb-1 text-xs text-slate-400">{note}</p> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-1">Component</th>
            <th className="py-1 text-right">Benchmark</th>
            <th className="py-1 text-right">Computed</th>
            <th className="py-1 text-right">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.component_kind}-${row.component_key}`} className="border-t border-slate-100">
              <td className="py-1.5 text-slate-600">{row.label}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">
                {inr(row.reference_amount)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">
                {row.computed_amount === null ? "—" : inr(row.computed_amount)}
              </td>
              <td
                className={`py-1.5 text-right font-semibold tabular-nums ${
                  row.difference === null
                    ? "text-slate-400"
                    : row.difference < 0
                      ? "text-emerald-700"
                      : "text-red-600"
                }`}
              >
                {row.difference === null
                  ? "not matched"
                  : `${row.difference < 0 ? "−" : "+"}${inr(Math.abs(row.difference))}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferenceCard({
  variance,
  onDeactivate,
  deactivating,
}: {
  variance: StdCostReferenceVariance;
  onDeactivate: (referenceId: string) => void;
  deactivating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{variance.brick_type}</h3>
          <p className="text-xs text-slate-500">
            {sourceLabel(variance.source)}
            {variance.source_label ? ` · ${variance.source_label}` : ""} ·{" "}
            {variance.reference_date}
          </p>
        </div>
        {variance.reference_id ? (
          <button
            type="button"
            onClick={() => onDeactivate(variance.reference_id as string)}
            disabled={deactivating}
            className="text-xs text-slate-400 hover:text-red-600 hover:underline disabled:opacity-40"
          >
            stop comparing
          </button>
        ) : null}
      </div>

      <VarianceHeadline variance={variance} />

      {variance.is_significant ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
          ⚠ Significant variance — worth explaining before anyone quotes from either number.
        </p>
      ) : null}

      {variance.notes ? <p className="mt-2 text-xs text-slate-500">{variance.notes}</p> : null}

      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        className="mt-2 text-sm font-medium text-orange-600 hover:underline"
      >
        {expanded ? "Hide breakdown" : "Where does the difference come from?"}
      </button>

      {expanded ? (
        <div className="mt-2 space-y-3 border-t border-slate-100 pt-2">
          {variance.has_component_breakdown ? (
            <>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    Breakdown coverage
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        variance.breakdown_status === "complete"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {variance.breakdown_status}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {inr(variance.breakdown_coverage)} / {inr(variance.reference_cost)}
                    {variance.breakdown_coverage_pct === null
                      ? ""
                      : ` (${variance.breakdown_coverage_pct}%)`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, variance.breakdown_coverage_pct ?? 0))}%`,
                    }}
                  />
                </div>
                {variance.breakdown_status === "partial" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Partial breakdown — the rest of the benchmark is still unaccounted for, so the
                    unexplained figure below stays live.
                  </p>
                ) : null}
              </div>

              <ComponentRows title="By cost element" rows={variance.cost_elements} />
              <ComponentRows
                title="Raw materials"
                rows={variance.raw_materials}
                note="Inside the raw-material element above — shown for detail, not added again."
              />
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">Explained by the breakdown</span>
                <span className="font-semibold tabular-nums text-slate-800">
                  {inr(variance.explained_difference)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No component breakdown has been recorded for this benchmark, so none of the
              difference is attributed yet. Add components as you discover them — each one shrinks
              the unexplained figure below, and the rest stays unexplained until it is genuinely
              accounted for.
            </p>
          )}

          <div
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              variance.unexplained_difference === 0
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900"
            }`}
          >
            <span>
              {variance.unexplained_difference === 0 ? "Fully explained" : "Still unexplained"}
            </span>
            <span className="font-semibold tabular-nums">
              {inr(variance.unexplained_difference)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddReferenceForm({
  brickTypes,
  onSave,
  saving,
  errorMessage,
}: {
  brickTypes: string[];
  onSave: (reference: StdCostReference) => void;
  saving: boolean;
  errorMessage: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [brickType, setBrickType] = useState(brickTypes[0] ?? "");
  const [cost, setCost] = useState("");
  const [source, setSource] = useState<StdCostReference["source"]>("manual_benchmark");
  const [sourceLabelText, setSourceLabelText] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [components, setComponents] = useState<Record<string, string>>({});
  const [breakdownStatus, setBreakdownStatus] =
    useState<StdCostBreakdownStatus>("partial");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
      >
        + Add a benchmark
      </button>
    );
  }

  const componentRows = STD_COST_ELEMENT_KEYS.filter((key) => (components[key] ?? "") !== "").map(
    (key) => ({
      component_kind: "cost_element" as const,
      component_key: key,
      amount: Number(components[key]),
    }),
  );
  const componentSum = componentRows.reduce((sum, row) => sum + row.amount, 0);
  const costNumber = Number(cost);
  // Over the total is always wrong; short of it is only wrong when the
  // breakdown claims to be complete.
  const overTotal =
    componentRows.length > 0 && componentSum > costNumber + STD_COST_BREAKDOWN_TOLERANCE;
  const incompleteButClaimed =
    breakdownStatus === "complete" &&
    Math.abs(componentSum - costNumber) > STD_COST_BREAKDOWN_TOLERANCE;
  const invalid =
    !brickType ||
    cost.trim() === "" ||
    !Number.isFinite(costNumber) ||
    overTotal ||
    incompleteButClaimed;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Brick type</span>
          <select
            value={brickType}
            onChange={(e) => setBrickType(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {brickTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Reference cost ₹/unit</span>
          <input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as StdCostReference["source"])}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {STD_COST_REFERENCE_SOURCES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Source name</span>
          <input
            type="text"
            value={sourceLabelText}
            onChange={(e) => setSourceLabelText(e.target.value)}
            placeholder="e.g. Mb Unit Economics sheet"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Reference date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-xs font-medium text-slate-500">Notes</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where this number came from, and what it is meant to represent"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Component breakdown (optional)
        </h4>
        <p className="mb-2 text-xs text-slate-400">
          Fill these in only if you know the benchmark&apos;s own split. They must add up to the
          reference cost — a breakdown that does not is worse than none, because the residual it
          leaves would be meaningless.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {STD_COST_ELEMENT_KEYS.map((key) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {STD_COST_ELEMENT_LABELS[key]}
              </span>
              <input
                type="number"
                step="0.01"
                value={components[key] ?? ""}
                onChange={(e) =>
                  setComponents((previous) => ({ ...previous, [key]: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>
        {componentRows.length > 0 ? (
          <div className="mt-2 space-y-1">
            <p
              className={`text-xs ${
                overTotal || incompleteButClaimed ? "text-red-600" : "text-slate-500"
              }`}
            >
              Covers {inr(componentSum)} of {inr(Number.isFinite(costNumber) ? costNumber : 0)}
              {overTotal
                ? " — a breakdown cannot exceed the total it splits"
                : incompleteButClaimed
                  ? ` — marked complete, but ${inr(costNumber - componentSum)} is unaccounted for`
                  : ""}
            </p>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={breakdownStatus === "complete"}
                onChange={(e) => setBreakdownStatus(e.target.checked ? "complete" : "partial")}
              />
              This breakdown is complete — it accounts for the whole benchmark
            </label>
            {breakdownStatus === "partial" ? (
              <p className="text-xs text-slate-400">
                Leaving it partial is normal. Whatever the components don&apos;t cover stays
                visible as unexplained variance rather than being quietly absorbed.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={invalid || saving}
          onClick={() =>
            onSave({
              brick_type: brickType,
              reference_cost: costNumber,
              source,
              source_label: sourceLabelText || null,
              reference_date: date,
              notes: notes || null,
              is_active: true,
              breakdown_status: breakdownStatus,
              components: componentRows,
            })
          }
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save benchmark"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ReconciliationPanel({
  variances,
  brickTypes,
  publishedValidFrom,
  isDraftPreview,
  onSaveReference,
  onDeactivateReference,
  saving,
  deactivating,
  errorMessage,
}: {
  variances: StdCostReferenceVariance[];
  brickTypes: string[];
  publishedValidFrom: string | null;
  isDraftPreview: boolean;
  onSaveReference: (reference: StdCostReference) => void;
  onDeactivateReference: (referenceId: string) => void;
  saving: boolean;
  deactivating: boolean;
  errorMessage: string | null;
}) {
  const significant = variances.filter((variance) => variance.is_significant);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Cost reconciliation"
        subtitle={
          isDraftPreview
            ? "Your unsaved draft against the stored benchmarks."
            : publishedValidFrom
              ? `The standard in force since ${publishedValidFrom}, against the stored benchmarks.`
              : "Nothing is published yet."
        }
        actions={
          <AddReferenceForm
            brickTypes={brickTypes}
            onSave={onSaveReference}
            saving={saving}
            errorMessage={errorMessage}
          />
        }
      >
        <p className="mb-3 text-sm text-slate-500">
          Benchmarks are stored separately from the standard and never feed into it. A difference
          here is a question to answer — the only way to move a computed cost is to correct a
          business input in the draft and publish it.
        </p>

        {significant.length > 0 ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ {significant.length} of {variances.length} benchmarks differ by more than 10%:{" "}
            {significant.map((variance) => variance.brick_type).join(", ")}.
          </p>
        ) : null}

        {variances.length === 0 ? (
          <p className="text-sm text-slate-400">
            No benchmarks recorded yet. Add one to reconcile the computed standard against a legacy
            or external number.
          </p>
        ) : (
          <div className="space-y-3">
            {variances.map((variance) => (
              <ReferenceCard
                key={`${variance.brick_type}-${variance.reference_id ?? variance.reference_date}`}
                variance={variance}
                onDeactivate={onDeactivateReference}
                deactivating={deactivating}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
