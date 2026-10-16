"use client";

/**
 * Shared client helpers for the Factory Ledger pages: typed fetchers over
 * /api/factory, the Sat–Fri week picker, and the stock-take banner.
 */

import { useQuery } from "@tanstack/react-query";
import { factoryWeekEnd, factoryWeekStart, parseISODate, toISODate } from "@/lib/factory";

export async function getFactory<T>(path: string): Promise<T> {
  const res = await fetch(`/api/factory/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return (await res.json()).data as T;
}

export async function sendFactory<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/factory/${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json?.data as T;
}

export type StockRow = {
  id: string;
  code: string;
  opening_stock: number | null;
  opening_counted_at: string | null;
  produced: number;
  delivered: number;
  committed: number;
  stock_balance: number;
  free_stock: number;
  bricks_per_bag: number | null;
};

export function useStock() {
  return useQuery({
    queryKey: ["factory", "stock"],
    queryFn: () => getFactory<StockRow[]>("stock"),
  });
}

export const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN");

/* ------------------------------------------------------------- banner */

export function StockTakeBanner() {
  const { data } = useStock();
  const uncounted = (data ?? []).filter((p) => !p.opening_counted_at);
  if (!data || uncounted.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-semibold">⚠️ Opening stock not counted.</span> Stock
      figures assume 0 as at 01/07 for{" "}
      {uncounted.map((p) => p.code).join(", ")} — every balance below is
      understated until the yard is physically counted.{" "}
      <a href="/factory/data" className="font-semibold underline">
        Enter the stock-take →
      </a>
    </div>
  );
}

/* -------------------------------------------------------- week picker */

export function WeekPicker({
  week,
  onChange,
}: {
  week: string; // any date inside the week; normalised to its Saturday
  onChange: (saturday: string) => void;
}) {
  const start = factoryWeekStart(week);
  const end = factoryWeekEnd(week);
  const shift = (days: number) => {
    const d = parseISODate(start);
    d.setDate(d.getDate() + days);
    onChange(toISODate(d));
  };
  const label = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => shift(-7)}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        aria-label="Previous week"
      >
        ←
      </button>
      <span className="min-w-[150px] text-center text-sm font-semibold">
        Sat {label(start)} – Fri {label(end)}
      </span>
      <button
        onClick={() => shift(7)}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        aria-label="Next week"
      >
        →
      </button>
    </div>
  );
}

/* ----------------------------------------------------------- flags */

export function DataFlagBadge({ flag }: { flag: string }) {
  if (flag === "OK") return null;
  const cls =
    flag === "Estimated"
      ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {flag}
    </span>
  );
}
