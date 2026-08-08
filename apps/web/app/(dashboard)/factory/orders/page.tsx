"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmt, getFactory, sendFactory, DataFlagBadge } from "@/components/factory/shared";

type OrderRow = {
  id: string;
  order_date: string;
  customer_name: string;
  credit_hold: boolean;
  product_code: string;
  qty_ordered: number;
  delivered: number;
  balance_due: number;
  fulfilment: string;
  payment_status: string;
  notes: string | null;
};

type Customer = { id: string; name: string; credit_hold: boolean };
type Product = { id: string; code: string };

// View 2: open orders, oldest first, credit-hold flagged.
export default function FactoryOrdersPage() {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const orders = useQuery({
    queryKey: ["factory", "orders", showAll],
    queryFn: () => getFactory<OrderRow[]>(`orders${showAll ? "" : "?status=open"}`),
  });
  const customers = useQuery({
    queryKey: ["factory", "customers"],
    queryFn: () => getFactory<Customer[]>("customers"),
  });
  const products = useQuery({
    queryKey: ["factory", "products"],
    queryFn: () => getFactory<Product[]>("products"),
  });

  const [form, setForm] = useState({
    customer_id: "",
    product_id: "",
    order_date: new Date().toISOString().slice(0, 10),
    qty_ordered: "",
    payment_status: "Clear",
    notes: "",
  });
  const create = useMutation({
    mutationFn: () =>
      sendFactory("orders", "POST", {
        ...form,
        qty_ordered: Number(form.qty_ordered),
        notes: form.notes || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["factory"] });
      setFormOpen(false);
      setForm((f) => ({ ...f, qty_ordered: "", notes: "" }));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show completed & cancelled
        </label>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
        >
          + New order
        </button>
      </div>

      {formOpen ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-700 dark:bg-slate-800">
          <select
            value={form.customer_id}
            onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Customer…</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.credit_hold ? " (CREDIT HOLD)" : ""}
              </option>
            ))}
          </select>
          <select
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Product…</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.order_date}
            onChange={(e) => setForm({ ...form, order_date: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <input
            type="number"
            min={1}
            placeholder="Qty ordered"
            value={form.qty_ordered}
            onChange={(e) => setForm({ ...form, qty_ordered: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <select
            value={form.payment_status}
            onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option>Clear</option>
            <option>Hold - Payment</option>
            <option>Cancelled</option>
          </select>
          <input
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.customer_id || !form.product_id || !form.qty_ordered}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {create.isPending ? "Saving…" : "Save order"}
            </button>
            {create.isError ? (
              <p className="text-sm text-red-600">
                {create.error instanceof Error ? create.error.message : "Failed"}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
              <th className="px-4 py-3">Order</th>
              <th className="px-3 py-3 text-right">Ordered</th>
              <th className="px-3 py-3 text-right">Delivered</th>
              <th className="px-3 py-3 text-right">Balance due</th>
              <th className="px-3 py-3">Fulfilment</th>
              <th className="px-3 py-3">Payment</th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : (orders.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No open orders 🎉
                </td>
              </tr>
            ) : (
              (orders.data ?? []).map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-700/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {o.customer_name} — {fmt(o.qty_ordered)} {o.product_code}
                      {o.credit_hold ? (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900 dark:text-red-200">
                          CREDIT HOLD
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-400">
                      {o.order_date}
                      {o.notes ? ` · ${o.notes}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right">{fmt(o.qty_ordered)}</td>
                  <td className="px-3 py-3 text-right">{fmt(o.delivered)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{fmt(o.balance_due)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        o.fulfilment === "Complete"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                          : o.fulfilment === "Partial"
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {o.fulfilment}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {o.payment_status !== "Clear" ? <DataFlagBadge flag={o.payment_status} /> : "Clear"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
