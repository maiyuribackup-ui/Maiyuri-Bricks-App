"use client";

/**
 * Number-by-number diff, old → new (PRD §7.2 and §10.4). Used both by the
 * publish flow (draft vs currently published) and by History (any two
 * published versions).
 */
import type { StdCostDiffRow } from "@maiyuri/shared";
import { inr } from "./form";

const SECTION_LABELS: Record<StdCostDiffRow["section"], string> = {
  version: "Version settings",
  raw_material: "Raw materials",
  brick_type: "Brick type inputs",
  recipe: "Recipes",
  fixed_cost: "Fixed costs",
  computed: "Computed totals",
};

const SECTION_ORDER: StdCostDiffRow["section"][] = [
  "computed",
  "raw_material",
  "recipe",
  "brick_type",
  "fixed_cost",
  "version",
];

function renderValue(value: number | string | null, isMoney: boolean): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  return isMoney ? inr(value) : String(value);
}

export function DiffTable({
  rows,
  beforeLabel,
  afterLabel,
  emptyMessage = "No changes.",
}: {
  rows: StdCostDiffRow[];
  beforeLabel: string;
  afterLabel: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {SECTION_ORDER.filter((section) => rows.some((row) => row.section === section)).map(
        (section) => (
          <div key={section}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {SECTION_LABELS[section]}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1">Item</th>
                    <th className="py-1">Field</th>
                    <th className="py-1 text-right">{beforeLabel}</th>
                    <th className="py-1 text-right">{afterLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((row) => row.section === section)
                    .map((row, i) => {
                      const isMoney =
                        !row.label.toLowerCase().includes("kg") &&
                        !row.label.toLowerCase().includes("batch") &&
                        !row.label.toLowerCase().includes("basis") &&
                        !row.label.toLowerCase().includes("match") &&
                        !row.label.toLowerCase().includes("label");
                      const rose =
                        typeof row.before === "number" &&
                        typeof row.after === "number" &&
                        row.after > row.before;
                      return (
                        <tr key={`${row.group}-${row.label}-${i}`} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-600">{row.group}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{row.label}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-slate-400 line-through">
                            {renderValue(row.before, isMoney)}
                          </td>
                          <td
                            className={`py-1.5 text-right font-semibold tabular-nums ${
                              rose ? "text-red-600" : "text-emerald-700"
                            }`}
                          >
                            {renderValue(row.after, isMoney)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
