"use client";

/**
 * WallCostSettings — founder editor for the global wall-cost template.
 * A 3×4 grid (systems × line items, ₹/sq.ft of wall) with live per-system
 * totals. Controlled locally; calls onSave(config) with is_seeded_placeholder
 * cleared once the founder saves real numbers.
 */
import { useState } from "react";
import type { WallCostConfig, WallCostLineItems, WallSystem } from "@maiyuri/shared";
import { sumLineItems, PLACEHOLDER_WALL_COST_CONFIG } from "@/lib/pricing/wall-cost";

const SYSTEMS: { key: WallSystem; label: string }[] = [
  { key: "interlock", label: "Maiyuri Interlock" },
  { key: "red_brick", label: "Red Brick" },
  { key: "aac", label: "AAC Block" },
];

const LINE_ITEMS: { key: keyof WallCostLineItems; label: string }[] = [
  { key: "masonry_units", label: "Bricks / blocks" },
  { key: "mortar_cement", label: "Mortar & cement" },
  { key: "plastering", label: "Plastering" },
  { key: "labour", label: "Labour" },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function WallCostSettings({
  initial,
  onSave,
  saving,
}: {
  initial: WallCostConfig | null | undefined;
  onSave: (config: WallCostConfig) => void;
  saving?: boolean;
}) {
  const [config, setConfig] = useState<WallCostConfig>(
    () => initial ?? PLACEHOLDER_WALL_COST_CONFIG,
  );
  const isPlaceholder = config.is_seeded_placeholder ?? false;

  const setCell = (
    system: WallSystem,
    item: keyof WallCostLineItems,
    raw: string,
  ) => {
    const n = raw === "" ? 0 : Math.max(0, Number(raw));
    if (Number.isNaN(n)) return;
    setConfig((c) => ({
      ...c,
      [system]: { ...c[system], [item]: n },
    }));
  };

  return (
    <div className="space-y-4">
      {isPlaceholder && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          ⚠️ These are <strong>placeholder</strong> values. Replace them with
          Maiyuri’s real per-sq.ft costs, then Save — the customer comparison
          uses these numbers.
        </div>
      )}

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cost per sq.ft of <strong>finished wall</strong> (₹). Interlock’s edge is
        no plastering and less mortar — enter each system’s real costs.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left p-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                ₹ / sq.ft
              </th>
              {SYSTEMS.map((s) => (
                <th
                  key={s.key}
                  className="p-2 text-xs font-semibold text-slate-700 dark:text-slate-200 text-center min-w-[7rem]"
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINE_ITEMS.map((item) => (
              <tr key={item.key}>
                <td className="p-2 text-slate-600 dark:text-slate-300">
                  {item.label}
                </td>
                {SYSTEMS.map((s) => (
                  <td key={s.key} className="p-1.5">
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={config[s.key][item.key] ?? 0}
                      onChange={(e) => setCell(s.key, item.key, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="p-2 font-bold text-slate-900 dark:text-white">
                Total / sq.ft
              </td>
              {SYSTEMS.map((s) => {
                const total = sumLineItems(config[s.key]);
                const isInterlock = s.key === "interlock";
                return (
                  <td
                    key={s.key}
                    className={`p-2 text-center font-bold tabular-nums ${isInterlock ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}
                  >
                    {inr(total)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <button
        onClick={() =>
          onSave({ ...config, is_seeded_placeholder: false })
        }
        disabled={saving}
        className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save wall costs"}
      </button>
    </div>
  );
}
