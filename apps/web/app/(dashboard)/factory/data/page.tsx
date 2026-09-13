"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmt, getFactory, sendFactory } from "@/components/factory/shared";

type Product = {
  id: string;
  code: string;
  opening_stock: number | null;
  opening_counted_at: string | null;
  notes: string | null;
};
type Customer = {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  credit_hold: boolean;
  notes: string | null;
};
type Trip = {
  id: string;
  trip_date: string;
  vehicle: string;
  start_km: number | null;
  end_km: number | null;
  diesel_litres: number | null;
  notes: string | null;
};
type Asset = {
  id: string;
  asset: string;
  category: string;
  qty: number;
  location: string;
  notes: string | null;
};

// Low-traffic CRUD: products (the opening stock-take entry lives HERE),
// customers, trips, asset register.
export default function FactoryDataPage() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["factory"] });

  const products = useQuery({
    queryKey: ["factory", "products"],
    queryFn: () => getFactory<Product[]>("products"),
  });
  const customers = useQuery({
    queryKey: ["factory", "customers"],
    queryFn: () => getFactory<Customer[]>("customers"),
  });
  const trips = useQuery({
    queryKey: ["factory", "trips"],
    queryFn: () => getFactory<Trip[]>("trips"),
  });
  const assets = useQuery({
    queryKey: ["factory", "assets"],
    queryFn: () => getFactory<Asset[]>("assets"),
  });

  const [openingDraft, setOpeningDraft] = useState<Record<string, string>>({});
  const saveOpening = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      sendFactory("products", "PATCH", { id, opening_stock: value }),
    onSuccess: invalidate,
  });

  const toggleHold = useMutation({
    mutationFn: (c: Customer) =>
      sendFactory("customers", "PATCH", { id: c.id, credit_hold: !c.credit_hold }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-8">
      {/* ------------------------------------------- opening stock-take */}
      <section>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Products — opening stock (physical count as at 01/07)
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Entering a count records today as the stock-take date and clears the
          warning banner. A genuine count of 0 is valid.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(products.data ?? []).map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{p.code}</span>
                {p.opening_counted_at ? (
                  <span className="text-xs text-emerald-600">✓ counted {p.opening_counted_at}</span>
                ) : (
                  <span className="text-xs font-semibold text-amber-600">not counted</span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder={p.opening_stock != null ? String(p.opening_stock) : "count"}
                  value={openingDraft[p.id] ?? ""}
                  onChange={(e) => setOpeningDraft({ ...openingDraft, [p.id]: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                  onClick={() =>
                    saveOpening.mutate({ id: p.id, value: Number(openingDraft[p.id]) })
                  }
                  disabled={saveOpening.isPending || openingDraft[p.id] === undefined || openingDraft[p.id] === ""}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
        {saveOpening.isError ? (
          <p className="mt-2 text-sm text-red-600">
            {saveOpening.error instanceof Error ? saveOpening.error.message : "Failed"}
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------- customers */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Customers ({(customers.data ?? []).length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Credit</th>
                <th className="px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(customers.data ?? []).map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-slate-500">{c.location ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleHold.mutate(c)}
                      disabled={toggleHold.isPending}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        c.credit_hold
                          ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                      }`}
                    >
                      {c.credit_hold ? "ON HOLD" : "Clear"}
                    </button>
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-xs text-slate-400">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------- trips */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Vehicle log ({(trips.data ?? []).length} trips)
        </h2>
        <div className="space-y-1.5">
          {(trips.data ?? []).map((t) => {
            const km = t.start_km != null && t.end_km != null ? t.end_km - t.start_km : null;
            const kmpl =
              km != null && t.diesel_litres ? Math.round((km / t.diesel_litres) * 100) / 100 : null;
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="w-20 text-xs text-slate-400">{t.trip_date}</span>
                <span className="w-32 font-medium">{t.vehicle}</span>
                <span className="text-xs text-slate-500">
                  {km != null ? `${fmt(km)} km` : "—"}
                  {t.diesel_litres ? ` · ${t.diesel_litres} L` : ""}
                  {kmpl != null ? ` · ${kmpl} km/L` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{t.notes}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------ assets */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Asset register ({(assets.data ?? []).length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                <th className="px-4 py-2.5">Asset</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(assets.data ?? []).map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
                  <td className="px-4 py-2 font-medium">{a.asset}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{a.category}</td>
                  <td className="px-3 py-2 text-right">{fmt(a.qty)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{a.location}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-400">{a.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
