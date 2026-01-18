"use client";

import { cn } from "@maiyuri/ui";

interface MaterialLine {
  materialId: string;
  materialName: string;
  expectedQty: number;
  actualQty: number;
  uom: string;
}

interface RawMaterialConsumptionProps {
  materials: MaterialLine[];
  onUpdateActual: (materialId: string, actualQty: number) => void;
  readOnly?: boolean;
}

export function RawMaterialConsumption({
  materials,
  onUpdateActual,
  readOnly = false,
}: RawMaterialConsumptionProps) {
  const getDifference = (expected: number, actual: number) => {
    const diff = Math.round((actual - expected) * 100) / 100;
    return {
      value: diff,
      display: diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString(),
      color:
        diff > 0
          ? "text-red-600 dark:text-red-400"
          : diff < 0
            ? "text-green-600 dark:text-green-400"
            : "text-slate-500 dark:text-slate-400",
    };
  };

  if (materials.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">
        Select a finished good to see raw material requirements.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="pb-2 text-left font-medium text-slate-700 dark:text-slate-300">
              Raw Material
            </th>
            <th className="pb-2 text-right font-medium text-slate-700 dark:text-slate-300">
              Expected
            </th>
            <th className="pb-2 text-right font-medium text-slate-700 dark:text-slate-300">
              Actual
            </th>
            <th className="pb-2 text-right font-medium text-slate-700 dark:text-slate-300">
              Diff
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {materials.map((material) => {
            const diff = getDifference(
              material.expectedQty,
              material.actualQty,
            );
            return (
              <tr key={material.materialId}>
                <td className="py-3 text-slate-900 dark:text-white">
                  {material.materialName}
                </td>
                <td className="py-3 text-right text-slate-600 dark:text-slate-300">
                  {material.expectedQty.toLocaleString()} {material.uom}
                </td>
                <td className="py-3 text-right">
                  {readOnly ? (
                    <span className="text-slate-900 dark:text-white">
                      {material.actualQty.toLocaleString()} {material.uom}
                    </span>
                  ) : (
                    <input
                      type="number"
                      value={material.actualQty}
                      onChange={(e) =>
                        onUpdateActual(
                          material.materialId,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      step="0.01"
                      min="0"
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  )}
                </td>
                <td className={cn("py-3 text-right font-medium", diff.color)}>
                  {diff.value !== 0 ? diff.display : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary */}
      <div className="mt-3 rounded-md bg-slate-100 p-3 dark:bg-slate-800">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600 dark:text-slate-400">
            Total Materials: {materials.length}
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Variance:{" "}
            <span
              className={cn(
                "font-medium",
                materials.reduce(
                  (sum, m) => sum + (m.actualQty - m.expectedQty),
                  0,
                ) > 0
                  ? "text-red-600 dark:text-red-400"
                  : materials.reduce(
                        (sum, m) => sum + (m.actualQty - m.expectedQty),
                        0,
                      ) < 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-slate-600 dark:text-slate-400",
              )}
            >
              {materials.reduce(
                (sum, m) => sum + (m.actualQty - m.expectedQty),
                0,
              ) > 0
                ? "+"
                : ""}
              {materials
                .reduce((sum, m) => sum + (m.actualQty - m.expectedQty), 0)
                .toLocaleString()}{" "}
              total
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
