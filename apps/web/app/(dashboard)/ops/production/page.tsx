"use client";

/**
 * Operations Control — Production (PRD §20–§38, §83).
 *
 * This screen is used standing in a factory yard on a phone, so it is built
 * around thumbs and daylight rather than a desktop grid: one day at a time,
 * large numeric inputs, and a Post button that is visually unmistakable from
 * Save draft — because those two do completely different things.
 *
 * The lifecycle is the interface. A draft is freely editable and moves
 * nothing. POST is the moment the numbers become real: stock exists, bricks
 * are reserved for named orders, coverage changes. So POST is the only
 * destructive-feeling action here, it states its consequences before it
 * fires, and it refuses while any accepted output is still unassigned.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";

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
const send = <T,>(url: string, method: string, payload?: unknown) =>
  fetchJson<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

interface Allocation {
  id: string;
  purpose: "sales_order" | "stock";
  so_line_id: string | null;
  order_name: string | null;
  partner_name: string | null;
  stock_ref: string | null;
  planned_qty: number;
}
interface PlanLine {
  id: string;
  finished_good_id: string;
  product_name: string | null;
  planned_qty: number;
  lock_version: number;
  allocations: Allocation[];
}
interface Actual {
  id: string;
  finished_good_id: string;
  product_name: string | null;
  status: "draft" | "posted" | "adjusted";
  planned_qty_snapshot: number | null;
  gross_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  lock_version: number;
  allocation_actuals: { id: string; allocation_id: string; actual_qty: number }[];
  consumption: { material: string; bags: number }[];
  unassigned_qty: number;
}
interface Shift {
  id: string;
  shift_no: number;
  planned_manpower: number | null;
  actual_manpower: number | null;
  lock_version: number;
  plan_lines: PlanLine[];
  actuals: Actual[];
}
interface Day {
  id: string;
  prod_date: string;
  planned_shift_count: number;
  shifts: Shift[];
}
interface DayPayload {
  date: string;
  day: Day | null;
}

const qty = (n: number) => Number(n).toLocaleString("en-IN");

function todayIso(): string {
  // IST is UTC+5:30 year-round; the yard's day, not UTC's.
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export default function ProductionPage() {
  const [date, setDate] = useState(todayIso());
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ops-production"] });

  const q = useQuery<DayPayload>({
    queryKey: ["ops-production", date],
    queryFn: () => fetchJson<DayPayload>(`/api/ops-control/production/days?date=${date}`),
  });

  const openDay = useMutation({
    mutationFn: () =>
      send("/api/ops-control/production/days", "POST", {
        prod_date: date,
        planned_shift_count: 2,
      }),
    onSuccess: refresh,
  });

  const day = q.data?.day ?? null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Production
            </h2>
            <p className="text-sm text-slate-500">
              Plan the day, record what each shift made, then post it. Nothing
              affects stock until it is posted.
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      </Card>

      {q.isLoading ? (
        <Card className="flex justify-center p-14">
          <Spinner />
        </Card>
      ) : q.error ? (
        <Card className="p-6">
          <p className="text-sm text-red-700">{(q.error as Error).message}</p>
        </Card>
      ) : !day ? (
        <Card className="p-10 text-center">
          <p className="text-slate-500">No production day opened for {date}.</p>
          <button
            onClick={() => openDay.mutate()}
            disabled={openDay.isPending}
            className="mt-4 rounded-xl bg-slate-900 px-5 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {openDay.isPending ? "Opening…" : "Open this day (2 shifts)"}
          </button>
          {openDay.error && (
            <p className="mt-3 text-sm text-red-700">{(openDay.error as Error).message}</p>
          )}
        </Card>
      ) : (
        day.shifts.map((shift) => (
          <ShiftCard key={shift.id} shift={shift} onChanged={refresh} />
        ))
      )}
    </div>
  );
}

function ShiftCard({ shift, onChanged }: { shift: Shift; onChanged: () => void }) {
  const actualByProduct = useMemo(
    () => new Map(shift.actuals.map((a) => [a.finished_good_id, a])),
    [shift.actuals],
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Shift {shift.shift_no}
        </h3>
        <span className="text-xs text-slate-500">
          {shift.actual_manpower ?? shift.planned_manpower ?? "—"} people
        </span>
      </div>

      {shift.plan_lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Nothing planned for this shift yet.
        </p>
      ) : (
        <div className="space-y-3">
          {shift.plan_lines.map((line) => (
            <PlanLineCard
              key={line.id}
              line={line}
              actual={actualByProduct.get(line.finished_good_id) ?? null}
              shiftId={shift.id}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function PlanLineCard({
  line,
  actual,
  shiftId,
  onChanged,
}: {
  line: PlanLine;
  actual: Actual | null;
  shiftId: string;
  onChanged: () => void;
}) {
  const [gross, setGross] = useState(String(actual?.gross_qty ?? ""));
  const [accepted, setAccepted] = useState(String(actual?.accepted_qty ?? ""));
  const [rejected, setRejected] = useState(String(actual?.rejected_qty ?? ""));

  const posted = actual?.status === "posted" || actual?.status === "adjusted";

  const saveDraft = useMutation({
    mutationFn: () =>
      send("/api/ops-control/production/actuals", "POST", {
        shift_id: shiftId,
        finished_good_id: line.finished_good_id,
        gross_qty: Number(gross || 0),
        accepted_qty: Number(accepted || 0),
        rejected_qty: Number(rejected || 0),
        ...(actual ? { lock_version: actual.lock_version } : {}),
      }),
    onSuccess: onChanged,
  });

  const post = useMutation({
    mutationFn: () =>
      send(
        `/api/ops-control/production/actuals/${actual?.id}/post`,
        "POST",
        { lock_version: actual?.lock_version ?? 0 },
      ),
    onSuccess: onChanged,
  });

  const grossN = Number(gross || 0);
  const acceptedN = Number(accepted || 0);
  const rejectedN = Number(rejected || 0);
  const balanceBroken = acceptedN + rejectedN > grossN;
  const unassigned = actual?.unassigned_qty ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{line.product_name ?? "—"}</span>
        <span className="text-xs text-slate-500">
          planned {qty(line.planned_qty)}
        </span>
      </div>

      {/* Allocations: what this output is FOR. Stock is a real purpose, not a
          fake order (PRD §24), so it is labelled as such. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {line.allocations.map((a) => (
          <span
            key={a.id}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {a.purpose === "stock"
              ? `Stock ${qty(a.planned_qty)}`
              : `${a.order_name ?? "SO"} ${qty(a.planned_qty)}`}
          </span>
        ))}
        {line.allocations.length === 0 && (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Not allocated — this output has no destination yet
          </span>
        )}
      </div>

      {posted ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
          Posted — {qty(actual!.accepted_qty)} accepted, now reserved and curing.
          {actual!.status === "adjusted" && " Adjusted since posting."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Gross" value={gross} onChange={setGross} />
            <NumberField label="Accepted" value={accepted} onChange={setAccepted} />
            <NumberField label="Rejected" value={rejected} onChange={setRejected} />
          </div>

          {balanceBroken && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              Accepted plus rejected cannot exceed gross.
            </p>
          )}
          {actual && unassigned !== 0 && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {qty(Math.abs(unassigned))} {unassigned > 0 ? "not yet assigned" : "over-assigned"} —
              posting is blocked until every accepted brick has a destination.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => saveDraft.mutate()}
              disabled={balanceBroken || saveDraft.isPending}
              className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
            >
              {saveDraft.isPending ? "Saving…" : "Save draft"}
            </button>
            {/* Deliberately the heavier control: this is the irreversible one. */}
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Post ${qty(acceptedN)} accepted?\n\nThis creates stock, reserves it against the allocated orders, and cannot be edited afterwards — corrections become adjustments.`,
                  )
                ) {
                  post.mutate();
                }
              }}
              disabled={!actual || unassigned !== 0 || acceptedN <= 0 || post.isPending}
              className="min-h-11 flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-base font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              {post.isPending ? "Posting…" : "Post"}
            </button>
          </div>

          {(saveDraft.error || post.error) && (
            <p className="mt-2 text-sm text-red-700">
              {((saveDraft.error ?? post.error) as Error).message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Large target, numeric keypad — this is filled in with one thumb. */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-lg tabular-nums dark:border-slate-700 dark:bg-slate-800"
      />
    </label>
  );
}
