"use client";

/**
 * Operations Control — the planning week (PRD §12, §20-26).
 *
 * A whole factory week on one screen, because planning is a desk job done in
 * one sitting. The day-at-a-time screens are for the yard; this is for the
 * Saturday morning when someone decides what the week will make.
 *
 * THE ONE THING THIS SCREEN KNOWS THAT A SPREADSHEET CANNOT:
 *
 *   A delivery promised on Friday the 18th needs bricks made by Friday the
 *   11th, because they cure for seven days. Plan them for the 15th and the
 *   quantities balance perfectly while the customer gets nothing.
 *
 * So the production grid carries a "needed by" row derived from the
 * commitments, the commitments carry a per-line verdict, and anything that
 * cannot be met is hoisted to the top of the page rather than left for
 * someone to notice. Coverage arithmetic alone would call every one of those
 * cases green.
 *
 * The delivery grid is READ-ONLY on purpose. A confirmed delivery date is a
 * promise a customer is holding a PDF of; moving it is a conversation and a
 * new schedule version, not a cell edit. This screen's job is to make sure
 * nobody is surprised by one.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";
import { addDays, cellKey } from "@/lib/ops-control/planning-grid";

interface Envelope<T> {
  data: T | null;
  error: string | null;
}
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const b = (await res.json()) as Envelope<T>;
  if (!res.ok || b.error) throw new Error(b.error ?? "Request failed");
  return b.data as T;
}

type Risk = "ready" | "curing_in_time" | "planned" | "at_risk" | "uncovered";

interface PlanCell {
  finished_good_id: string;
  date: string;
  quantity: number;
  editable: boolean;
  locked_reason: string | null;
  split_across_shifts: boolean;
}
interface Commitment {
  id: string;
  schedule_id: string;
  so_line_id: string;
  finished_good_id: string;
  product_name: string | null;
  order_name: string;
  customer_name: string | null;
  delivery_date: string;
  quantity: number;
  risk: Risk;
  shortfall: number;
  produce_by: string;
  timing_only: boolean;
}
interface Unscheduled {
  so_line_id: string;
  product_name: string | null;
  order_name: string;
  customer_name: string | null;
  remaining: number;
  scheduled: number;
  unscheduled: number;
}
interface WeekPayload {
  week: { start: string; end: string; days: string[] };
  today: string;
  products: { id: string; name: string | null; curing_days: number }[];
  plan_cells: PlanCell[];
  commitments: Commitment[];
  unscheduled: Unscheduled[];
  requirement: { finished_good_id: string; date: string; quantity: number }[];
  overdue: { finished_good_id: string; quantity: number }[];
  beyond: { finished_good_id: string; quantity: number }[];
}

const qty = (n: number) => Number(n).toLocaleString("en-IN");
const todayIso = () =>
  new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const DAY_NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
function dayLabel(iso: string, index: number) {
  const [, m, d] = iso.split("-");
  return { name: DAY_NAMES[index], date: `${d}/${m}` };
}

const RISK_LABEL: Record<Risk, string> = {
  ready: "Ready",
  curing_in_time: "Curing, in time",
  planned: "Planned",
  at_risk: "At risk",
  uncovered: "Uncovered",
};
const RISK_CLASS: Record<Risk, string> = {
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  curing_in_time: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  planned: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  at_risk: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
  uncovered: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
};

export default function PlanPage() {
  const [weekStart, setWeekStart] = useState<string>("");
  const queryClient = useQueryClient();

  const q = useQuery<WeekPayload>({
    queryKey: ["ops-plan", weekStart],
    queryFn: () =>
      fetchJson<WeekPayload>(
        `/api/ops-control/planning/week${weekStart ? `?week_start=${weekStart}` : ""}`,
      ),
    // Keep the previous week on screen while the next loads, so the grid does
    // not blank out under the planner mid-thought.
    placeholderData: (prev) => prev,
  });

  const week = q.data?.week;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Plan the week
            </h2>
            <p className="text-sm text-slate-500">
              Saturday to Friday. What we will make, against what we have
              already promised — allowing for curing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addDays(week?.start ?? todayIso(), -7))}
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700"
              aria-label="Previous week"
            >
              ←
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700 dark:text-slate-200">
              {week ? `${dayLabel(week.start, 0).date} – ${dayLabel(week.end, 6).date}` : "…"}
            </span>
            <button
              onClick={() => setWeekStart(addDays(week?.start ?? todayIso(), 7))}
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700"
              aria-label="Next week"
            >
              →
            </button>
            <button
              onClick={() => setWeekStart("")}
              className="min-h-11 rounded-xl px-3 text-sm text-slate-500 underline underline-offset-2"
            >
              This week
            </button>
          </div>
        </div>
      </Card>

      {q.isLoading && !q.data ? (
        <Card className="flex justify-center p-14">
          <Spinner />
        </Card>
      ) : q.error ? (
        <Card className="p-6">
          <p className="text-sm text-red-700">{(q.error as Error).message}</p>
        </Card>
      ) : q.data ? (
        <>
          <AtRiskBanner payload={q.data} />
          <ProductionGrid
            payload={q.data}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["ops-plan"] })}
          />
          <CommitmentsGrid payload={q.data} />
          <UnscheduledCard rows={q.data.unscheduled} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The commitments that will not be met, hoisted above everything else.
 *
 * A planner should not have to find these by scanning a grid. If this card is
 * absent, the week is sound.
 */
function AtRiskBanner({ payload }: { payload: WeekPayload }) {
  const bad = payload.commitments
    .filter((c) => c.risk === "uncovered" || c.risk === "at_risk")
    .sort((a, b) => {
      // Commitments already past their last possible production date first:
      // they need a phone call today, not a plan.
      const aLate = a.produce_by < payload.today ? 0 : 1;
      const bLate = b.produce_by < payload.today ? 0 : 1;
      return aLate - bLate || a.delivery_date.localeCompare(b.delivery_date);
    });
  const impossible = bad.filter((c) => c.produce_by < payload.today).length;

  if (bad.length === 0) {
    return (
      <Card className="border-emerald-200 p-4 dark:border-emerald-900">
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          Every confirmed delivery in the next four weeks has a path to the
          customer. {payload.commitments.length}{" "}
          {payload.commitments.length === 1 ? "commitment" : "commitments"} checked.
        </p>
      </Card>
    );
  }
  return (
    <Card className="border-red-200 p-4 dark:border-red-900">
      <h3 className="font-semibold text-red-900 dark:text-red-200">
        {bad.length} customer {bad.length === 1 ? "commitment" : "commitments"} will
        not be met
        {impossible > 0 && (
          <span className="font-normal">
            {" "}
            — {impossible} of them can no longer be made in time
          </span>
        )}
      </h3>
      <ul className="mt-3 space-y-2">
        {bad.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-red-50/60 p-3 text-sm dark:bg-red-900/10"
          >
            <span className="font-medium text-slate-900 dark:text-white">
              {c.customer_name ?? c.order_name}
            </span>
            <span className="text-slate-500">
              {qty(c.quantity)} {c.product_name ?? "—"} on {c.delivery_date}
            </span>
            <span className="ml-auto text-red-800 dark:text-red-200">
              {c.produce_by < payload.today ? (
                // No amount of production fixes this one: the last date it
                // could have started has passed. Telling a planner to
                // "produce by" a date in the past reads as advice when the
                // only remaining action is to call the customer.
                <>
                  <strong>cannot be made in time</strong> — the last date to
                  start was {c.produce_by}. Talk to the customer.
                </>
              ) : c.timing_only ? (
                <>
                  bricks exist but cure too late — move production to{" "}
                  <strong>{c.produce_by}</strong> or earlier
                </>
              ) : (
                <>
                  short {qty(c.shortfall)} — must be produced by{" "}
                  <strong>{c.produce_by}</strong>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        &quot;Produce by&quot; already allows for curing. Producing after that
        date cannot reach the customer on time however many bricks are made.
      </p>
    </Card>
  );
}

function ProductionGrid({
  payload,
  onSaved,
}: {
  payload: WeekPayload;
  onSaved: () => void;
}) {
  const { week, products, plan_cells, requirement, overdue, beyond, today } = payload;
  // Edits live here until saved; the server value shows through until then.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const cellMap = useMemo(() => {
    const m = new Map<string, PlanCell>();
    for (const c of plan_cells) m.set(cellKey(c.finished_good_id, c.date), c);
    return m;
  }, [plan_cells]);

  const reqMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requirement) m.set(cellKey(r.finished_good_id, r.date), r.quantity);
    return m;
  }, [requirement]);

  const overdueMap = useMemo(
    () => new Map(overdue.map((o) => [o.finished_good_id, o.quantity])),
    [overdue],
  );
  const beyondMap = useMemo(
    () => new Map(beyond.map((b) => [b.finished_good_id, b.quantity])),
    [beyond],
  );

  const valueOf = (fg: string, date: string): string => {
    const key = cellKey(fg, date);
    if (key in edits) return edits[key];
    const cell = cellMap.get(key);
    return cell && cell.quantity > 0 ? String(cell.quantity) : "";
  };

  const dirty = Object.keys(edits).length > 0;

  const save = useMutation({
    mutationFn: () =>
      fetchJson<{ written: number; cleared: number; skipped: { reason: string }[] }>(
        "/api/ops-control/planning/production-cells",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            week_start: week.start,
            cells: Object.entries(edits).map(([key, raw]) => {
              const [finished_good_id, date] = key.split("|");
              return {
                finished_good_id,
                date,
                quantity: raw === "" ? 0 : Number(raw),
              };
            }),
          }),
        },
      ),
    onSuccess: (r) => {
      setErr(null);
      setEdits({});
      const parts = [
        r.written > 0 ? `${r.written} saved` : null,
        r.cleared > 0 ? `${r.cleared} cleared` : null,
      ].filter(Boolean);
      setNote(
        r.skipped.length > 0
          ? `${parts.join(", ") || "Nothing changed"}. ${r.skipped.length} skipped: ${r.skipped[0].reason}`
          : parts.join(", ") || "Nothing changed",
      );
      onSaved();
    },
    onError: (e: Error) => setErr(e.message),
  });

  // Column totals reflect what is ON SCREEN, edits included — a planner
  // balancing a day needs the running total, not the saved one.
  const dayTotal = (date: string) =>
    products.reduce((sum, p) => sum + (Number(valueOf(p.id, date)) || 0), 0);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Production plan
          </h3>
          <p className="text-sm text-slate-500">
            Type quantities and save once. The{" "}
            <span className="font-medium">needed by</span> row is what the
            confirmed deliveries require, walked back through curing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => {
                setEdits({});
                setNote(null);
              }}
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              Discard
            </button>
          )}
          <button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="min-h-11 rounded-xl bg-slate-900 px-4 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {save.isPending
              ? "Saving…"
              : dirty
                ? `Save ${Object.keys(edits).length} change${Object.keys(edits).length === 1 ? "" : "s"}`
                : "Saved"}
          </button>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      {note && !err && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{note}</p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-slate-500 dark:bg-slate-900">
                Product
              </th>
              {week.days.map((d, i) => {
                const l = dayLabel(d, i);
                return (
                  <th
                    key={d}
                    className={`px-2 py-2 text-center font-medium ${
                      d === today
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-500"
                    }`}
                  >
                    <div>{l.name}</div>
                    <div className="text-xs font-normal">{l.date}</div>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-medium text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const rowTotal = week.days.reduce(
                (sum, d) => sum + (Number(valueOf(p.id, d)) || 0),
                0,
              );
              return (
                <ProductRow
                  key={p.id}
                  product={p}
                  days={week.days}
                  today={today}
                  rowTotal={rowTotal}
                  overdue={overdueMap.get(p.id) ?? 0}
                  beyond={beyondMap.get(p.id) ?? 0}
                  valueOf={valueOf}
                  cellMap={cellMap}
                  reqMap={reqMap}
                  onChange={(date, raw) =>
                    setEdits((e) => ({ ...e, [cellKey(p.id, date)]: raw }))
                  }
                />
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Day total
              </td>
              {week.days.map((d) => (
                <td
                  key={d}
                  className="border-t border-slate-200 px-2 py-2 text-center font-medium tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  {dayTotal(d) > 0 ? qty(dayTotal(d)) : "—"}
                </td>
              ))}
              <td className="border-t border-slate-200 px-3 py-2 text-right font-semibold tabular-nums dark:border-slate-700">
                {qty(week.days.reduce((s, d) => s + dayTotal(d), 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProductRow({
  product,
  days,
  today,
  rowTotal,
  overdue,
  beyond,
  valueOf,
  cellMap,
  reqMap,
  onChange,
}: {
  product: { id: string; name: string | null; curing_days: number };
  days: string[];
  today: string;
  rowTotal: number;
  overdue: number;
  beyond: number;
  valueOf: (fg: string, date: string) => string;
  cellMap: Map<string, PlanCell>;
  reqMap: Map<string, number>;
  onChange: (date: string, raw: string) => void;
}) {
  const hasRequirement = days.some((d) => (reqMap.get(cellKey(product.id, d)) ?? 0) > 0);
  return (
    <>
      <tr>
        <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-slate-900">
          <div className="font-medium text-slate-900 dark:text-white">
            {product.name ?? "Unnamed product"}
          </div>
          <div className="text-xs text-slate-400">
            cures {product.curing_days}d
          </div>
        </td>
        {days.map((d) => {
          const cell = cellMap.get(cellKey(product.id, d));
          const locked = cell ? !cell.editable : false;
          return (
            <td
              key={d}
              className={`px-1 py-1 text-center ${
                d === today ? "bg-slate-50 dark:bg-slate-800/40" : ""
              }`}
            >
              <input
                inputMode="numeric"
                type="number"
                min="0"
                step="1"
                disabled={locked}
                title={cell?.locked_reason ?? undefined}
                value={valueOf(product.id, d)}
                onChange={(e) => onChange(d, e.target.value)}
                className={`h-11 w-full min-w-[4.5rem] rounded-lg border px-2 text-center text-base tabular-nums ${
                  locked
                    ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500"
                    : "border-slate-200 dark:border-slate-700 dark:bg-slate-800"
                }`}
              />
            </td>
          );
        })}
        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">
          {rowTotal > 0 ? qty(rowTotal) : "—"}
        </td>
      </tr>
      {(hasRequirement || overdue > 0 || beyond > 0) && (
        <tr>
          <td className="sticky left-0 z-10 bg-white px-3 pb-2 text-xs text-slate-500 dark:bg-slate-900">
            needed by
            {overdue > 0 && (
              <span className="ml-1 font-medium text-red-700 dark:text-red-300">
                · {qty(overdue)} already overdue
              </span>
            )}
          </td>
          {days.map((d) => {
            const need = reqMap.get(cellKey(product.id, d)) ?? 0;
            const planned = Number(valueOf(product.id, d)) || 0;
            return (
              <td key={d} className="px-2 pb-2 text-center text-xs tabular-nums">
                {need > 0 ? (
                  <span
                    className={
                      planned >= need
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "font-medium text-red-700 dark:text-red-300"
                    }
                  >
                    {qty(need)}
                  </span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                )}
              </td>
            );
          })}
          <td className="px-3 pb-2 text-right text-xs text-slate-400">
            {beyond > 0 ? `+${qty(beyond)} later` : ""}
          </td>
        </tr>
      )}
    </>
  );
}

function CommitmentsGrid({ payload }: { payload: WeekPayload }) {
  const { week, commitments } = payload;
  const inWeek = commitments.filter(
    (c) => c.delivery_date >= week.start && c.delivery_date <= week.end,
  );
  const later = commitments.filter((c) => c.delivery_date > week.end);

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-slate-900 dark:text-white">
        Confirmed deliveries
      </h3>
      <p className="text-sm text-slate-500">
        What customers are holding a schedule for. Read-only here — moving a
        confirmed date is a conversation with the customer and a new schedule
        version, not a cell edit.
      </p>

      {inWeek.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/50">
          Nothing is confirmed for delivery this week.
          {later.length > 0 &&
            ` ${later.length} ${later.length === 1 ? "delivery is" : "deliveries are"} confirmed later in the horizon.`}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Product</th>
                {week.days.map((d, i) => {
                  const l = dayLabel(d, i);
                  return (
                    <th key={d} className="py-2 text-center font-medium">
                      <div>{l.name}</div>
                      <div className="text-xs font-normal">{l.date}</div>
                    </th>
                  );
                })}
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {inWeek.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {c.customer_name ?? "—"}
                    </div>
                    <div className="text-xs text-slate-400">{c.order_name}</div>
                  </td>
                  <td className="py-2 text-slate-700 dark:text-slate-200">
                    {c.product_name ?? "—"}
                  </td>
                  {week.days.map((d) => (
                    <td
                      key={d}
                      className="py-2 text-center tabular-nums text-slate-700 dark:text-slate-200"
                    >
                      {c.delivery_date === d ? qty(c.quantity) : ""}
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${RISK_CLASS[c.risk]}`}
                      title={
                        c.shortfall > 0
                          ? `Short ${qty(c.shortfall)} — produce by ${c.produce_by}`
                          : undefined
                      }
                    >
                      {RISK_LABEL[c.risk]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {later.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-slate-500">
            {later.length} confirmed later in the horizon — some may need
            production this week
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {later.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-2">
                <span className="text-slate-700 dark:text-slate-200">
                  {c.delivery_date}
                </span>
                <span className="text-slate-500">
                  {c.customer_name ?? c.order_name} · {qty(c.quantity)}{" "}
                  {c.product_name ?? "—"}
                </span>
                <span className="text-xs text-slate-400">
                  produce by {c.produce_by}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${RISK_CLASS[c.risk]}`}
                >
                  {RISK_LABEL[c.risk]}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/**
 * Sold, but never put on a delivery date.
 *
 * These cannot show as at-risk, because as far as the schedule is concerned
 * they do not exist — which makes them more dangerous than a red row, not
 * less. The fix is a delivery schedule, so the card links to where that is
 * done rather than pretending it can be fixed here.
 */
function UnscheduledCard({ rows }: { rows: Unscheduled[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.unscheduled, 0);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Sold but never scheduled
          </h3>
          <p className="text-sm text-slate-500">
            {qty(total)} units across {rows.length}{" "}
            {rows.length === 1 ? "order line" : "order lines"} have no confirmed
            delivery date. They cannot appear as at-risk above, because nothing
            has been promised yet — which is the easier way to miss them.
          </p>
        </div>
        <Link
          href="/ops/demand"
          className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
        >
          Schedule in Demand
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {rows.slice(0, 12).map((r) => (
          <li
            key={r.so_line_id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="font-medium text-slate-900 dark:text-white">
              {r.customer_name ?? r.order_name}
            </span>
            <span className="text-slate-500">{r.product_name ?? "—"}</span>
            <span className="ml-auto tabular-nums text-slate-700 dark:text-slate-200">
              {qty(r.unscheduled)} unscheduled
              {r.scheduled > 0 && (
                <span className="text-slate-400"> of {qty(r.remaining)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 12 && (
        <p className="mt-2 text-xs text-slate-400">
          and {rows.length - 12} more.
        </p>
      )}
    </Card>
  );
}
