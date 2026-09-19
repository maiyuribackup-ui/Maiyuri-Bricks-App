"use client";

/**
 * Operations Control — Production (PRD §20–§38, §83).
 *
 * The whole day's work on one screen, in the order it actually happens:
 *
 *   open the day → plan a product into a shift → say who it is for
 *   → record what came out → assign that output → record cement → POST
 *
 * Built for a phone in a factory yard: one day at a time, numeric keypads,
 * 44px targets, and every step reachable without leaving the card.
 *
 * The lifecycle is the interface. A draft is freely editable and moves
 * nothing. POST is the moment the numbers become real — stock exists, bricks
 * are reserved against named orders, coverage changes — so it is the heavier
 * control, it names its consequences before firing, and it stays disabled
 * until every accepted brick has somewhere to go.
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
interface DemandOption {
  id: string;
  finished_good_id: string;
  order_name: string | null;
  partner_name: string | null;
  remaining: number;
}
interface DayPayload {
  date: string;
  day: Day | null;
  products: { id: string; name: string | null }[];
  demand: DemandOption[];
}

const qty = (n: number) => Number(n).toLocaleString("en-IN");
const todayIso = () =>
  // IST is UTC+5:30 year-round — the yard's day, not UTC's.
  new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

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
            className="mt-4 min-h-11 rounded-xl bg-slate-900 px-5 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {openDay.isPending ? "Opening…" : "Open this day (2 shifts)"}
          </button>
          {openDay.error && (
            <p className="mt-3 text-sm text-red-700">{(openDay.error as Error).message}</p>
          )}
        </Card>
      ) : (
        day.shifts.map((shift) => (
          <ShiftCard
            key={shift.id}
            shift={shift}
            products={q.data?.products ?? []}
            demand={q.data?.demand ?? []}
            onChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

function ShiftCard({
  shift,
  products,
  demand,
  onChanged,
}: {
  shift: Shift;
  products: { id: string; name: string | null }[];
  demand: DemandOption[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const actualByProduct = useMemo(
    () => new Map(shift.actuals.map((a) => [a.finished_good_id, a])),
    [shift.actuals],
  );
  const planned = new Set(shift.plan_lines.map((l) => l.finished_good_id));
  const available = products.filter((p) => !planned.has(p.id));

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Shift {shift.shift_no}
        </h3>
        <ManpowerField shift={shift} onChanged={onChanged} />
      </div>

      <div className="space-y-3">
        {shift.plan_lines.map((line) => (
          <PlanLineCard
            key={line.id}
            line={line}
            actual={actualByProduct.get(line.finished_good_id) ?? null}
            shiftId={shift.id}
            demand={demand.filter((d) => d.finished_good_id === line.finished_good_id)}
            onChanged={onChanged}
          />
        ))}

        {shift.plan_lines.length === 0 && !adding && (
          <p className="py-4 text-center text-sm text-slate-400">
            Nothing planned for this shift yet.
          </p>
        )}

        {adding ? (
          <AddPlanLine
            shiftId={shift.id}
            products={available}
            onDone={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={available.length === 0}
            className="min-h-11 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-base font-medium text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
          >
            {available.length === 0 ? "Every product is planned" : "+ Add product"}
          </button>
        )}
      </div>
    </Card>
  );
}

/** Aggregate head count only — never a list of names (PRD §22). */
function ManpowerField({ shift, onChanged }: { shift: Shift; onChanged: () => void }) {
  const [value, setValue] = useState(
    String(shift.actual_manpower ?? shift.planned_manpower ?? ""),
  );
  const save = useMutation({
    mutationFn: () =>
      send(`/api/ops-control/production/shifts/${shift.id}`, "PATCH", {
        actual_manpower: value === "" ? null : Number(value),
        lock_version: shift.lock_version,
      }),
    onSuccess: onChanged,
  });
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      People
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save.mutate()}
        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-base tabular-nums dark:border-slate-700 dark:bg-slate-800"
      />
    </label>
  );
}

function AddPlanLine({
  shiftId,
  products,
  onDone,
  onCancel,
}: {
  shiftId: string;
  products: { id: string; name: string | null }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [plannedQty, setPlannedQty] = useState("");
  const create = useMutation({
    mutationFn: () =>
      send("/api/ops-control/production/plan-lines", "POST", {
        shift_id: shiftId,
        finished_good_id: productId,
        planned_qty: Number(plannedQty),
      }),
    onSuccess: onDone,
  });

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name ?? "—"}
          </option>
        ))}
      </select>
      <input
        type="number"
        inputMode="numeric"
        placeholder="Planned quantity"
        value={plannedQty}
        onChange={(e) => setPlannedQty(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-lg tabular-nums dark:border-slate-700 dark:bg-slate-800"
      />
      {create.error && (
        <p className="mt-2 text-sm text-red-700">{(create.error as Error).message}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl px-4 py-2.5 text-base font-medium text-slate-600 dark:text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={!productId || Number(plannedQty) <= 0 || create.isPending}
          className="min-h-11 flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

function PlanLineCard({
  line,
  actual,
  shiftId,
  demand,
  onChanged,
}: {
  line: PlanLine;
  actual: Actual | null;
  shiftId: string;
  demand: DemandOption[];
  onChanged: () => void;
}) {
  const [gross, setGross] = useState(String(actual?.gross_qty ?? ""));
  const [accepted, setAccepted] = useState(String(actual?.accepted_qty ?? ""));
  const [rejected, setRejected] = useState(String(actual?.rejected_qty ?? ""));
  const [allocating, setAllocating] = useState(false);
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

  const removeLine = useMutation({
    mutationFn: () =>
      send(`/api/ops-control/production/plan-lines/${line.id}`, "DELETE"),
    onSuccess: onChanged,
  });

  const removeAllocation = useMutation({
    mutationFn: (id: string) =>
      send(`/api/ops-control/production/allocations/${id}`, "DELETE"),
    onSuccess: onChanged,
  });

  const post = useMutation({
    mutationFn: () =>
      send(`/api/ops-control/production/actuals/${actual?.id}/post`, "POST", {
        lock_version: actual?.lock_version ?? 0,
      }),
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
        <span className="flex items-center gap-2 text-xs text-slate-500">
          planned {qty(line.planned_qty)}
          {!actual && (
            <button
              onClick={() => removeLine.mutate()}
              className="text-slate-400 underline"
            >
              remove
            </button>
          )}
        </span>
      </div>
      {removeLine.error && (
        <p className="mb-2 text-sm text-red-700">{(removeLine.error as Error).message}</p>
      )}

      {/* WHO the output is for. Stock is a real purpose, not a fake order. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {line.allocations.map((a) => (
          <span
            key={a.id}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {a.purpose === "stock"
              ? `Stock ${qty(a.planned_qty)}`
              : `${a.order_name ?? "SO"} ${qty(a.planned_qty)}`}
            {!posted && (
              <button
                onClick={() => removeAllocation.mutate(a.id)}
                aria-label="Remove allocation"
                className="text-slate-400"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!posted &&
          (allocating ? null : (
            <button
              onClick={() => setAllocating(true)}
              className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-600"
            >
              + Allocate
            </button>
          ))}
      </div>
      {removeAllocation.error && (
        <p className="mb-2 text-sm text-red-700">
          {(removeAllocation.error as Error).message}
        </p>
      )}

      {allocating && (
        <AddAllocation
          planLineId={line.id}
          demand={demand}
          onDone={() => {
            setAllocating(false);
            onChanged();
          }}
          onCancel={() => setAllocating(false)}
        />
      )}

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

          <button
            onClick={() => saveDraft.mutate()}
            disabled={balanceBroken || saveDraft.isPending}
            className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
          >
            {saveDraft.isPending ? "Saving…" : "Save draft"}
          </button>

          {/* Assignment and cement only make sense once output exists. */}
          {actual && actual.accepted_qty > 0 && (
            <>
              <AssignOutput
                actual={actual}
                allocations={line.allocations}
                onChanged={onChanged}
              />
              <CementField actual={actual} onChanged={onChanged} />

              {unassigned !== 0 && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  {qty(Math.abs(unassigned))}{" "}
                  {unassigned > 0 ? "not yet assigned" : "over-assigned"} — posting is
                  blocked until every accepted brick has a destination.
                </p>
              )}

              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Post ${qty(actual.accepted_qty)} accepted?\n\nThis creates stock, reserves it against the allocated orders, and cannot be edited afterwards — corrections become adjustments.`,
                    )
                  ) {
                    post.mutate();
                  }
                }}
                disabled={unassigned !== 0 || post.isPending}
                className="mt-2 min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-base font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
              >
                {post.isPending ? "Posting…" : "Post"}
              </button>
            </>
          )}

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

function AddAllocation({
  planLineId,
  demand,
  onDone,
  onCancel,
}: {
  planLineId: string;
  demand: DemandOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [purpose, setPurpose] = useState<"sales_order" | "stock">(
    demand.length > 0 ? "sales_order" : "stock",
  );
  const [soLineId, setSoLineId] = useState(demand[0]?.id ?? "");
  const [plannedQty, setPlannedQty] = useState("");

  const create = useMutation({
    mutationFn: () =>
      send("/api/ops-control/production/allocations", "POST", {
        plan_line_id: planLineId,
        purpose,
        ...(purpose === "sales_order" ? { so_line_id: soLineId } : { stock_ref: "stock" }),
        planned_qty: Number(plannedQty),
      }),
    onSuccess: onDone,
  });

  return (
    <div className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex gap-2">
        <button
          onClick={() => setPurpose("sales_order")}
          disabled={demand.length === 0}
          className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40 ${
            purpose === "sales_order"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
          }`}
        >
          Sales order
        </button>
        <button
          onClick={() => setPurpose("stock")}
          className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
            purpose === "stock"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
          }`}
        >
          Stock
        </button>
      </div>

      {purpose === "sales_order" &&
        (demand.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No open orders for this product — produce it for stock instead.
          </p>
        ) : (
          <select
            value={soLineId}
            onChange={(e) => setSoLineId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
          >
            {demand.map((d) => (
              <option key={d.id} value={d.id}>
                {d.order_name ?? "SO"} · {d.partner_name ?? "—"} · {qty(d.remaining)} due
              </option>
            ))}
          </select>
        ))}

      <input
        type="number"
        inputMode="numeric"
        placeholder="Quantity for this destination"
        value={plannedQty}
        onChange={(e) => setPlannedQty(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-lg tabular-nums dark:border-slate-700 dark:bg-slate-800"
      />
      {create.error && (
        <p className="mt-2 text-sm text-red-700">{(create.error as Error).message}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl px-4 py-2.5 text-base font-medium text-slate-600 dark:text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={
            Number(plannedQty) <= 0 ||
            (purpose === "sales_order" && !soLineId) ||
            create.isPending
          }
          className="min-h-11 flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {create.isPending ? "Allocating…" : "Allocate"}
        </button>
      </div>
    </div>
  );
}

/**
 * Where the output actually went. This is what POST refuses without, and it
 * is the row a reservation traces back through — so a shortfall gets a named
 * answer rather than "we made fewer".
 */
function AssignOutput({
  actual,
  allocations,
  onChanged,
}: {
  actual: Actual;
  allocations: Allocation[];
  onChanged: () => void;
}) {
  const existing = useMemo(
    () => new Map(actual.allocation_actuals.map((a) => [a.allocation_id, a.actual_qty])),
    [actual.allocation_actuals],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      allocations.map((a) => [a.id, String(existing.get(a.id) ?? "")]),
    ),
  );

  const save = useMutation({
    mutationFn: () =>
      send(
        `/api/ops-control/production/actuals/${actual.id}/allocation-actuals`,
        "PUT",
        {
          lock_version: actual.lock_version,
          entries: allocations
            .map((a) => ({ allocation_id: a.id, actual_qty: Number(values[a.id] || 0) }))
            .filter((e) => e.actual_qty > 0),
        },
      ),
    onSuccess: onChanged,
  });

  const assigned = allocations.reduce((sum, a) => sum + Number(values[a.id] || 0), 0);
  const remaining = actual.accepted_qty - assigned;

  if (allocations.length === 0) {
    return (
      <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
        Allocate this product to an order or to stock before assigning output.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
        Where did the {qty(actual.accepted_qty)} accepted go?
      </p>
      <div className="space-y-2">
        {allocations.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">
              {a.purpose === "stock" ? "Stock" : (a.order_name ?? "SO")}
              <span className="ml-1 text-xs text-slate-400">
                planned {qty(a.planned_qty)}
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={values[a.id] ?? ""}
              onChange={(e) => setValues({ ...values, [a.id]: e.target.value })}
              className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-base tabular-nums dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        ))}
      </div>
      <p
        className={`mt-2 text-sm ${
          remaining === 0
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-amber-700 dark:text-amber-300"
        }`}
      >
        {remaining === 0
          ? "All accepted output is assigned."
          : `${qty(Math.abs(remaining))} ${remaining > 0 ? "left to assign" : "over-assigned"}`}
      </p>
      {save.error && (
        <p className="mt-2 text-sm text-red-700">{(save.error as Error).message}</p>
      )}
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2 text-base font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
      >
        {save.isPending ? "Saving…" : "Save assignment"}
      </button>
    </div>
  );
}

/** Cement per production line, in half bags (PRD §33). */
function CementField({ actual, onChanged }: { actual: Actual; onChanged: () => void }) {
  const current = actual.consumption.find((c) => c.material === "cement");
  const [bags, setBags] = useState(String(current?.bags ?? ""));
  const save = useMutation({
    mutationFn: () =>
      send(`/api/ops-control/production/actuals/${actual.id}/consumption`, "PUT", {
        material: "cement",
        bags: Number(bags || 0),
      }),
    onSuccess: onChanged,
  });

  const bagsN = Number(bags || 0);
  const perBag = bagsN > 0 ? actual.gross_qty / bagsN : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        Cement
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={bags}
          onChange={(e) => setBags(e.target.value)}
          onBlur={() => bags !== String(current?.bags ?? "") && save.mutate()}
          className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-base tabular-nums dark:border-slate-700 dark:bg-slate-800"
        />
        bags
      </label>
      {/* The ratio always uses GROSS output (PRD §35) — dividing by accepted
          would flatter it exactly when quality is worst. */}
      {perBag !== null && (
        <span className="text-xs text-slate-500">
          {perBag.toLocaleString("en-IN", { maximumFractionDigits: 2 })} bricks/bag
          (gross)
        </span>
      )}
      {save.error && (
        <span className="text-sm text-red-700">{(save.error as Error).message}</span>
      )}
    </div>
  );
}

/** Large target, numeric keypad — filled in with one thumb. */
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
