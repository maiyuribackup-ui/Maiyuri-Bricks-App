"use client";

import { Button } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import type { Employee } from "@maiyuri/shared";

interface ShiftRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  employeeIds: string[];
}

interface ShiftAttendanceInputProps {
  shifts: ShiftRecord[];
  employees: Employee[];
  onAddShift: () => void;
  onUpdateShift: (shiftId: string, updates: Partial<ShiftRecord>) => void;
  onRemoveShift: (shiftId: string) => void;
  disabled?: boolean;
}

export function ShiftAttendanceInput({
  shifts,
  employees,
  onAddShift,
  onUpdateShift,
  onRemoveShift,
  disabled = false,
}: ShiftAttendanceInputProps) {
  const handleEmployeeToggle = (shiftId: string, employeeId: string) => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    const isSelected = shift.employeeIds.includes(employeeId);
    const newEmployeeIds = isSelected
      ? shift.employeeIds.filter((id) => id !== employeeId)
      : [...shift.employeeIds, employeeId];

    onUpdateShift(shiftId, { employeeIds: newEmployeeIds });
  };

  // Filter to only factory workers
  const factoryWorkers = employees.filter(
    (emp) =>
      emp.is_active &&
      (emp.department?.toLowerCase().includes("factory") || !emp.department),
  );

  return (
    <div className="space-y-4">
      {shifts.length === 0 && (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-2">
          No shifts added yet. Add a shift to track employee attendance.
        </p>
      )}

      {shifts.map((shift, index) => (
        <div
          key={shift.id}
          className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white">
              Shift {index + 1} -{" "}
              {new Date(shift.date + "T00:00:00").toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </h4>
            <button
              type="button"
              onClick={() => onRemoveShift(shift.id)}
              disabled={disabled}
              className="text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={shift.startTime}
                onChange={(e) =>
                  onUpdateShift(shift.id, { startTime: e.target.value })
                }
                disabled={disabled}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                End Time (optional)
              </label>
              <input
                type="time"
                value={shift.endTime ?? ""}
                onChange={(e) =>
                  onUpdateShift(shift.id, { endTime: e.target.value || null })
                }
                disabled={disabled}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              Factory Workers ({shift.employeeIds.length} selected)
            </p>
            {factoryWorkers.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {factoryWorkers.map((emp) => {
                  const isSelected = shift.employeeIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors",
                        isSelected
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleEmployeeToggle(shift.id, emp.id)}
                        disabled={disabled}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-900 dark:text-white">
                        {emp.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No employees available. Sync from Odoo first.
              </p>
            )}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onAddShift}
        disabled={disabled}
        className="w-full"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Add Shift
      </Button>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}
