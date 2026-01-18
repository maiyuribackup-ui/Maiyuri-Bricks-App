"use client";

import { useState } from "react";
import { cn } from "@maiyuri/ui";
import type { FinishedGood } from "@maiyuri/shared";

interface FinishedGoodSelectorProps {
  goods: FinishedGood[];
  selectedGood: FinishedGood | null;
  onSelectGood: (good: FinishedGood) => void;
  disabled?: boolean;
}

export function FinishedGoodSelector({
  goods,
  selectedGood,
  onSelectGood,
  disabled = false,
}: FinishedGoodSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group by category
  const byCategory = goods.reduce(
    (acc, good) => {
      const category = good.category ?? "Uncategorized";
      if (!acc[category]) acc[category] = [];
      acc[category].push(good);
      return acc;
    },
    {} as Record<string, FinishedGood[]>,
  );

  const categories = Object.keys(byCategory);

  return (
    <div>
      {/* Category Tabs */}
      {categories.length > 0 ? (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
                disabled={disabled}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  activeCategory === cat
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          {activeCategory && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {byCategory[activeCategory].map((good) => {
                const isSelected = selectedGood?.id === good.id;
                return (
                  <button
                    key={good.id}
                    type="button"
                    onClick={() => onSelectGood(good)}
                    disabled={disabled}
                    className={cn(
                      "relative rounded-lg border-2 p-3 text-left transition-all",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {isSelected && (
                      <div className="absolute right-2 top-2">
                        <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    )}
                    <p className="text-sm font-medium text-slate-900 dark:text-white pr-6">
                      {good.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {good.bom_quantity?.toLocaleString() ?? "N/A"}{" "}
                      {good.uom_name ?? "units"}/batch
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {!activeCategory && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">
              Select a category above to choose a finished good
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">
          No finished goods available. Sync from Odoo first.
        </p>
      )}
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
        clipRule="evenodd"
      />
    </svg>
  );
}
