"use client";

/**
 * Operations Control — Inventory (PRD §3, §4).
 *
 * Odoo owns the quantity; this screen owns the explanation. The physical total
 * comes from Odoo's qty_available and is never argued with — where OC's own
 * ledger disagrees, the difference is shown as an exception to investigate,
 * not quietly adopted.
 *
 * The four buckets are the point of the screen. "8,000 in stock" is not an
 * answer to "what can I promise a customer today?"; Free-Ready is. Reserved
 * stock that is still curing is displayed with the date it becomes
 * dispatchable, because reserving it is correct but shipping it is not.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";
import { useAuthStore } from "@/stores/authStore";

const WRITE_ROLES = ["founder", "owner", "production_supervisor"];

interface Envelope<T> {
  data: T | null;
  error: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as Envelope<T>;
  if (!res.ok || body.error) throw new Error(body.error ?? "Request failed");
  return body.data as T;
}

interface ProductInventory {
  finished_good_id: string;
  product_name: string;
  stock_synced_at: string | null;
  physicalOnHand: number;
  curing: number;
  readyPhysical: number;
  reservedReady: number;
  reservedCuring: number;
  freeReady: number;
  freeCuring: number;
  nextReadyFrom: string | null;
  reconciliation: {
    odooOnHand: number;
    ledgerBalance: number;
    drift: number;
    hasDrift: boolean;
  };
}

interface InventoryPayload {
  as_of: string;
  products: ProductInventory[];
}

const qty = (n: number) => Number(n).toLocaleString("en-IN");

export default function OpsInventoryPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = !!role && WRITE_ROLES.includes(role);
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState<ProductInventory | null>(null);

  const q = useQuery<InventoryPayload>({
    queryKey: ["ops-inventory"],
    queryFn: () => fetchJson<InventoryPayload>("/api/ops-control/inventory"),
  });

  const products = q.data?.products ?? [];
  const exceptions = products.filter((p) => p.reconciliation.hasDrift);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Stock position
            </h2>
            <p className="text-sm text-slate-500">
              Physical quantities come from Odoo. Curing, reserved and free are
              derived from the operations ledger{" "}
              {q.data ? `as at ${q.data.as_of}` : ""}.
            </p>
          </div>
          <button
            onClick={() => q.refetch()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            Refresh
          </button>
        </div>
      </Card>

      {exceptions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {exceptions.length} product{exceptions.length === 1 ? "" : "s"} disagree
            with Odoo
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-800 dark:text-amber-300">
            {exceptions.map((p) => (
              <li key={p.finished_good_id}>
                {p.product_name}: Odoo {qty(p.reconciliation.odooOnHand)}, ledger{" "}
                {qty(p.reconciliation.ledgerBalance)} ({p.reconciliation.drift > 0 ? "+" : ""}
                {qty(p.reconciliation.drift)})
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Odoo&apos;s figure stands. Investigate the difference — an unsynced
            movement, a stock move made directly in Odoo, or a missing
            operational record — and post a reconciliation once you know why.
          </p>
        </Card>
      )}

      <Card className="p-0">
        {q.isLoading ? (
          <div className="flex justify-center py-14">
            <Spinner />
          </div>
        ) : q.error ? (
          <p className="px-4 py-6 text-sm text-red-700">{(q.error as Error).message}</p>
        ) : products.length === 0 ? (
          <p className="px-4 py-14 text-center text-slate-400">
            No active products.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-700">
                  {[
                    "Product",
                    "On hand (Odoo)",
                    "Free — ready",
                    "Free — curing",
                    "Reserved — ready",
                    "Reserved — curing",
                    "Ready from",
                    "",
                  ].map((h, i) => (
                    <th key={i} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.finished_good_id}
                    className="border-b border-slate-50 dark:border-slate-700/50"
                  >
                    <td className="px-4 py-3 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 tabular-nums">{qty(p.physicalOnHand)}</td>
                    {/* The only number safe to promise today. */}
                    <td className="px-4 py-3 tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                      {qty(p.freeReady)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">
                      {qty(p.freeCuring)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{qty(p.reservedReady)}</td>
                    <td className="px-4 py-3 tabular-nums text-amber-700 dark:text-amber-300">
                      {qty(p.reservedCuring)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {p.nextReadyFrom ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canWrite && (
                        <button
                          onClick={() => setAdjusting(p)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          Adjust
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adjusting && (
        <AdjustDialog
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            queryClient.invalidateQueries({ queryKey: ["ops-inventory"] });
          }}
        />
      )}
    </div>
  );
}

/**
 * A correction is a new movement, never an edit: the ledger is append-only, so
 * what is entered here is the DELTA, not the new total. Saying so on the form
 * is the difference between "-50" and someone typing the corrected balance.
 */
function AdjustDialog({
  product,
  onClose,
  onSaved,
}: {
  product: ProductInventory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [movementType, setMovementType] = useState<"adjustment" | "reconciliation" | "opening">(
    "adjustment",
  );
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/ops-control/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movement_type: movementType,
          finished_good_id: product.finished_good_id,
          quantity: Number(quantity),
          reason: reason.trim() || null,
        }),
      }),
    onSuccess: onSaved,
  });

  const parsed = Number(quantity);
  const valid =
    quantity.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed !== 0 &&
    (movementType === "opening" || reason.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {product.product_name}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Odoo holds {qty(product.physicalOnHand)}; the ledger explains{" "}
          {qty(product.reconciliation.ledgerBalance)}. Enter the change, not the
          new total — corrections are recorded as further movements so history
          stays intact.
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Type
          <select
            value={movementType}
            onChange={(e) =>
              setMovementType(e.target.value as "adjustment" | "reconciliation" | "opening")
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="adjustment">Adjustment</option>
            <option value="reconciliation">Reconciliation (accept investigated drift)</option>
            <option value="opening">Opening balance</option>
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Change in quantity
          <input
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. -50"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Reason {movementType !== "opening" && <span className="text-red-600">*</span>}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the figure changing?"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        {save.error && (
          <p className="mt-3 text-sm text-red-700">{(save.error as Error).message}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {save.isPending ? "Saving…" : "Post movement"}
          </button>
        </div>
      </div>
    </div>
  );
}
