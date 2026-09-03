"use client";

/**
 * Reimbursement / Petty Cash — founder/accountant cockpit.
 * All-staff balances, the pending-approval queue, one-click top-ups, and the
 * per-km vehicle-rate master. Engineers use the mobile app; this is the office
 * side (approve / reject / refill / set rates).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
  AllExpensesResponse,
  ExpenseBalance,
  ExpenseClaim,
  ExpenseVehicleRate,
} from "@maiyuri/shared";

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data as T;
}
async function postJson(url: string, payload: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data;
}

function useAllExpenses() {
  return useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => getJson<AllExpensesResponse>("/api/expenses?view=all"),
    refetchInterval: 60_000,
  });
}
function useVehicleRates() {
  return useQuery({
    queryKey: ["expense-rates"],
    queryFn: () => getJson<ExpenseVehicleRate[]>("/api/expenses/rates"),
  });
}

export default function ExpensesCockpit() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useAllExpenses();
  const rates = useVehicleRates();
  const [tab, setTab] = useState<"queue" | "balances" | "rates">("queue");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [topupFor, setTopupFor] = useState<ExpenseBalance | null>(null);
  const [topupAmt, setTopupAmt] = useState("");
  const [topupNote, setTopupNote] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["expenses-all"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => postJson(`/api/expenses/${id}/approve`, {}),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      postJson(`/api/expenses/${v.id}/reject`, { reason: v.reason }),
    onSuccess: () => {
      setRejecting(null);
      setReason("");
      invalidate();
    },
  });
  const topup = useMutation({
    mutationFn: (v: { user_id: string; amount: number; note?: string }) =>
      postJson("/api/expenses/topups", v),
    onSuccess: () => {
      setTopupFor(null);
      setTopupAmt("");
      setTopupNote("");
      invalidate();
    },
  });
  const saveRate = useMutation({
    mutationFn: (v: Partial<ExpenseVehicleRate>) =>
      postJson("/api/expenses/rates", v, "PUT"),
    onSuccess: () => rates.refetch(),
  });

  const pending = data?.pending ?? [];
  const balances = data?.balances ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">💰 Reimbursements</h1>
        <p className="text-sm text-slate-500">
          Petty-cash balances, expense approvals, and top-ups.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {([
          ["queue", `Pending (${pending.length})`],
          ["balances", "Balances"],
          ["rates", "Vehicle rates"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              tab === k
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-slate-400">Loading…</div>
      ) : isError ? (
        <div className="py-16 text-center text-red-500">
          {error instanceof Error ? error.message : "Failed to load"}
        </div>
      ) : tab === "queue" ? (
        pending.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
            ✅ No expenses waiting for approval
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((c: ExpenseClaim) => (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {c.expense_type?.icon ?? "🧾"} {c.expense_type?.name ?? "Expense"} ·{" "}
                      {inr(c.amount)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.user?.name ?? "staff"} · {c.expense_date}
                      {c.project ? ` · ${c.project.name}` : ""}
                    </div>
                    {c.km ? (
                      <div className="mt-1 text-xs text-slate-500">
                        🚗 {c.from_location} → {c.to_location} · {c.km} km ×{" "}
                        {inr(c.per_km_rate_applied ?? 0)}/km
                        {c.customer_name ? ` · ${c.customer_name}` : ""}
                      </div>
                    ) : null}
                    {c.description ? (
                      <div className="mt-1 text-sm text-slate-600">{c.description}</div>
                    ) : null}
                    {c.receipt_url ? (
                      <button
                        onClick={async () => {
                          const r = await getJson<{ url: string }>(
                            `/api/expenses/receipts?path=${encodeURIComponent(c.receipt_url!)}`,
                          );
                          window.open(r.url, "_blank");
                        }}
                        className="mt-1 text-xs font-medium text-sky-600 hover:underline"
                      >
                        📎 View receipt
                      </button>
                    ) : null}
                  </div>
                  {rejecting === c.id ? null : (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => approve.mutate(c.id)}
                        disabled={approve.isPending}
                        className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejecting(c.id)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
                {rejecting === c.id ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejection"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => reject.mutate({ id: c.id, reason })}
                      disabled={reason.trim().length < 3 || reject.isPending}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                      className="px-2 text-xs text-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : tab === "balances" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Given</th>
                <th className="px-4 py-3">Spent</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b: ExpenseBalance) => (
                <tr key={b.user_id} className="border-b border-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{b.name ?? "—"}</div>
                    <div className="text-xs text-slate-400">
                      {b.role.replace(/_/g, " ")}
                      {b.pending_count ? ` · ${b.pending_count} pending` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inr(b.topups_total)}</td>
                  <td className="px-4 py-3 text-slate-600">{inr(b.spent_total)}</td>
                  <td
                    className={`px-4 py-3 font-semibold ${b.balance < 0 ? "text-red-600" : "text-slate-900"}`}
                  >
                    {inr(b.balance)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setTopupFor(b)}
                      className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      + Top up
                    </button>
                  </td>
                </tr>
              ))}
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No field staff with petty-cash access yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <RatesEditor
          rates={rates.data ?? []}
          onSave={(v) => saveRate.mutate(v)}
          saving={saveRate.isPending}
        />
      )}

      {/* Top-up modal */}
      {topupFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5">
            <h3 className="text-lg font-bold text-slate-900">
              Top up — {topupFor.name}
            </h3>
            <p className="text-xs text-slate-500">
              Current balance {inr(topupFor.balance)}
            </p>
            <input
              value={topupAmt}
              onChange={(e) => setTopupAmt(e.target.value)}
              inputMode="numeric"
              placeholder="Amount ₹"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={topupNote}
              onChange={(e) => setTopupNote(e.target.value)}
              placeholder="Note (optional)"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setTopupFor(null)}
                className="px-3 py-2 text-sm text-slate-500"
              >
                Cancel
              </button>
              <button
                disabled={!Number(topupAmt) || topup.isPending}
                onClick={() =>
                  topup.mutate({
                    user_id: topupFor.user_id,
                    amount: Number(topupAmt),
                    note: topupNote || undefined,
                  })
                }
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {topup.isPending ? "Adding…" : "Add top-up"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RatesEditor({
  rates,
  onSave,
  saving,
}: {
  rates: ExpenseVehicleRate[];
  onSave: (v: Partial<ExpenseVehicleRate>) => void;
  saving: boolean;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newRate, setNewRate] = useState("");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm text-slate-500">
        Per-kilometre rates used to compute petrol reimbursement (amount = km ×
        rate).
      </p>
      <div className="space-y-2">
        {rates.map((r) => (
          <RateRow key={r.id} rate={r} onSave={onSave} saving={saving} />
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-4">
        <div className="flex-1">
          <label className="text-xs text-slate-400">New vehicle</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Tempo"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="w-28">
          <label className="text-xs text-slate-400">₹/km</label>
          <input
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          disabled={!newLabel.trim() || !Number(newRate) || saving}
          onClick={() => {
            onSave({ label: newLabel.trim(), per_km_rate: Number(newRate) });
            setNewLabel("");
            setNewRate("");
          }}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RateRow({
  rate,
  onSave,
  saving,
}: {
  rate: ExpenseVehicleRate;
  onSave: (v: Partial<ExpenseVehicleRate>) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState(String(rate.per_km_rate));
  const dirty = val !== String(rate.per_km_rate);
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-sm text-slate-700">{rate.label}</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        inputMode="numeric"
        className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
      />
      <span className="text-xs text-slate-400">₹/km</span>
      <button
        disabled={!dirty || !Number(val) || saving}
        onClick={() => onSave({ id: rate.id, label: rate.label, per_km_rate: Number(val) })}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}
