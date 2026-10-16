"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataFlagBadge,
  fmt,
  getFactory,
  sendFactory,
  WeekPicker,
} from "@/components/factory/shared";
import { factoryWeekStart, parseISODate, toISODate } from "@/lib/factory";

type DeliveryRow = {
  id: string;
  delivery_date: string;
  qty: number;
  status: string;
  data_flag: string;
  notes: string | null;
  factory_customers: { name: string; credit_hold: boolean } | null;
  factory_products: { code: string } | null;
};

const DAY_NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

// View 3: the Sat–Fri delivery schedule grouped by day, with the daily
// Planned → Delivered / Postponed workflow.
export default function FactorySchedulePage() {
  const queryClient = useQueryClient();
  const [week, setWeek] = useState(toISODate(new Date()));
  const weekStart = factoryWeekStart(week);

  const deliveries = useQuery({
    queryKey: ["factory", "deliveries", weekStart],
    queryFn: () => getFactory<DeliveryRow[]>(`deliveries?week=${weekStart}`),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      sendFactory(`deliveries/${id}`, "PATCH", { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["factory"] }),
  });

  const byDay = useMemo(() => {
    const days: { date: string; name: string; rows: DeliveryRow[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = parseISODate(weekStart);
      d.setDate(d.getDate() + i);
      days.push({ date: toISODate(d), name: DAY_NAMES[i], rows: [] });
    }
    for (const row of deliveries.data ?? []) {
      days.find((d) => d.date === row.delivery_date)?.rows.push(row);
    }
    return days;
  }, [deliveries.data, weekStart]);

  return (
    <div className="space-y-4">
      <WeekPicker week={week} onChange={setWeek} />

      {deliveries.isLoading ? (
        <p className="py-8 text-center text-slate-400">Loading…</p>
      ) : (
        byDay.map((day) => (
          <section key={day.date}>
            <h3 className="mb-1.5 text-sm font-bold text-slate-500">
              {day.name} <span className="font-normal text-slate-400">{day.date}</span>
            </h3>
            {day.rows.length === 0 ? (
              <p className="mb-2 text-xs text-slate-300 dark:text-slate-600">
                No deliveries.
              </p>
            ) : (
              <div className="space-y-1.5">
                {day.rows.map((r) => {
                  const hold = r.factory_customers?.credit_hold;
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {r.factory_customers?.name ?? "?"} — {fmt(r.qty)}{" "}
                          {r.factory_products?.code ?? "?"}
                          {hold ? (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900 dark:text-red-200">
                              CREDIT HOLD
                            </span>
                          ) : null}{" "}
                          <DataFlagBadge flag={r.data_flag} />
                        </p>
                        {r.notes ? (
                          <p className="truncate text-xs text-slate-400">{r.notes}</p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.status === "Delivered"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                            : r.status === "Postponed"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                              : r.status === "Cancelled"
                                ? "bg-slate-200 text-slate-500 line-through dark:bg-slate-700"
                                : "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
                        }`}
                      >
                        {r.status}
                      </span>
                      {r.status === "Planned" || r.status === "Postponed" ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => updateStatus.mutate({ id: r.id, status: "Delivered" })}
                            disabled={updateStatus.isPending || hold}
                            title={hold ? "Credit hold — do not dispatch" : undefined}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            ✓ Delivered
                          </button>
                          {r.status === "Planned" ? (
                            <button
                              onClick={() => updateStatus.mutate({ id: r.id, status: "Postponed" })}
                              disabled={updateStatus.isPending}
                              className="rounded-lg border border-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-700 disabled:opacity-40 dark:text-amber-300"
                            >
                              Postpone
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}
      {updateStatus.isError ? (
        <p className="text-sm text-red-600">
          {updateStatus.error instanceof Error ? updateStatus.error.message : "Update failed"}
        </p>
      ) : null}
    </div>
  );
}
