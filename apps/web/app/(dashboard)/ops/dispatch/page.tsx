"use client";

/**
 * Operations Control — Dispatch (PRD §41–§56, §83).
 *
 * The day's trips, in the order the work happens:
 *
 *   plan a trip → add a stop → load a product for it
 *   → driver reports loaded / delivered / returned / damaged → COMPLETE
 *
 * Two things this screen is built around:
 *
 * 1. WARNINGS WARN, RECONCILIATION BLOCKS (§72/§73). An over-capacity load
 *    shows red and saves anyway — the person in the yard can see the vehicle.
 *    But COMPLETE is refused while a single loaded brick is unaccounted for,
 *    so the running "N unexplained" is shown live rather than as a server
 *    error after the fact.
 *
 * 2. INVENTORY AND FULFILMENT ARE DIFFERENT NUMBERS (§7). The card shows both
 *    before completing: stock falls by what left less what came back, while
 *    the customer is credited only with what they accepted.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";

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
const send = <T,>(url: string, method: string, payload?: unknown) =>
  fetchJson<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

interface Reconciliation {
  accounted: number;
  unexplained: number;
  balanced: boolean;
  netInventoryImpact: number;
  customerFulfilment: number;
}
interface LoadLine {
  id: string;
  finished_good_id: string;
  product_name: string | null;
  so_line_id: string | null;
  order_name: string | null;
  planned_qty: number;
  status: "draft" | "completed" | "adjusted";
  actual_loaded_qty: number | null;
  actual_unloaded_qty: number | null;
  returned_qty: number;
  damaged_qty: number;
  lost_or_short_qty: number;
  lock_version: number;
  reconciliation: Reconciliation | null;
}
interface Stop {
  id: string;
  sequence: number;
  customer_name: string | null;
  status: string;
  load_lines: LoadLine[];
}
interface Warning {
  code: string;
  severity: "warning" | "info";
  message: string;
}
interface Trip {
  id: string;
  trip_date: string;
  trip_no: number;
  vehicle_id: string | null;
  vehicle_label: string | null;
  status: string;
  override_reason: string | null;
  lock_version: number;
  stops: Stop[];
  utilisation: { pct: number | null; band: string; unpricedProducts: string[] };
  warnings: Warning[];
}
interface DemandOption {
  id: string;
  finished_good_id: string;
  order_name: string | null;
  partner_name: string | null;
  remaining: number;
}
interface DispatchPayload {
  date: string;
  trips: Trip[];
  vehicles: { id: string; label: string }[];
  products: { id: string; name: string | null }[];
  demand: DemandOption[];
}

const qty = (n: number) => Number(n).toLocaleString("en-IN");
const todayIso = () =>
  new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const BAND_CLASS: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  red_over: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  red_under: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  not_evaluated: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export default function DispatchPage() {
  const [date, setDate] = useState(todayIso());
  const [planning, setPlanning] = useState(false);
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ops-dispatch"] });

  const q = useQuery<DispatchPayload>({
    queryKey: ["ops-dispatch", date],
    queryFn: () => fetchJson<DispatchPayload>(`/api/ops-control/dispatch/trips?date=${date}`),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Dispatch
            </h2>
            <p className="text-sm text-slate-500">
              Plan trips and record what each delivery actually did. Stock only
              moves when a delivery is completed.
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
      ) : (
        <>
          {(q.data?.trips ?? []).map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              products={q.data?.products ?? []}
              demand={q.data?.demand ?? []}
              onChanged={refresh}
            />
          ))}

          {(q.data?.trips ?? []).length === 0 && !planning && (
            <Card className="p-10 text-center">
              <p className="text-slate-500">No trips planned for {date}.</p>
            </Card>
          )}

          {planning ? (
            <PlanTrip
              date={date}
              vehicles={q.data?.vehicles ?? []}
              nextTripNo={(q.data?.trips ?? []).length + 1}
              onDone={() => {
                setPlanning(false);
                refresh();
              }}
              onCancel={() => setPlanning(false)}
            />
          ) : (
            <button
              onClick={() => setPlanning(true)}
              className="min-h-11 w-full rounded-xl border border-dashed border-slate-300 py-3 text-base font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              + Plan a trip
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PlanTrip({
  date,
  vehicles,
  nextTripNo,
  onDone,
  onCancel,
}: {
  date: string;
  vehicles: { id: string; label: string }[];
  nextTripNo: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const create = useMutation({
    mutationFn: () =>
      send("/api/ops-control/dispatch/trips", "POST", {
        trip_date: date,
        vehicle_id: vehicleId || null,
        override_reason: reason.trim() || null,
      }),
    onSuccess: onDone,
  });

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-medium">Trip {nextTripNo}</p>
      <select
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
      >
        <option value="">No vehicle yet</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      {/* Only needed beyond the normal trips per day, but harmless to offer:
          the server decides whether it is required. */}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (only if this is an extra trip)"
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
      />
      {create.error && (
        <p className="mt-2 text-sm text-red-700">{(create.error as Error).message}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl px-4 py-2.5 text-base font-medium text-slate-600 dark:text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="min-h-11 flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {create.isPending ? "Planning…" : "Plan trip"}
        </button>
      </div>
    </Card>
  );
}

function TripCard({
  trip,
  products,
  demand,
  onChanged,
}: {
  trip: Trip;
  products: { id: string; name: string | null }[];
  demand: DemandOption[];
  onChanged: () => void;
}) {
  const [addingStop, setAddingStop] = useState(false);
  const [customer, setCustomer] = useState("");

  const addStop = useMutation({
    mutationFn: () =>
      send("/api/ops-control/dispatch/stops", "POST", {
        trip_id: trip.id,
        customer_name: customer.trim() || null,
      }),
    onSuccess: () => {
      setCustomer("");
      setAddingStop(false);
      onChanged();
    },
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Trip {trip.trip_no}
          {trip.vehicle_label && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              {trip.vehicle_label}
            </span>
          )}
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            BAND_CLASS[trip.utilisation.band] ?? BAND_CLASS.not_evaluated
          }`}
        >
          {trip.utilisation.pct === null
            ? "Load not measured"
            : `${trip.utilisation.pct.toFixed(0)}% loaded`}
        </span>
      </div>

      {/* Advisory only — none of these can refuse a save (PRD §72/§73). */}
      {trip.warnings.map((w) => (
        <p
          key={w.code}
          className={`mb-2 text-sm ${
            w.severity === "warning"
              ? "text-amber-700 dark:text-amber-300"
              : "text-slate-500"
          }`}
        >
          {w.message}
        </p>
      ))}

      <div className="space-y-3">
        {trip.stops.map((stop) => (
          <StopCard
            key={stop.id}
            stop={stop}
            products={products}
            demand={demand}
            onChanged={onChanged}
          />
        ))}

        {addingStop ? (
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer or site"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base dark:border-slate-700 dark:bg-slate-800"
            />
            {addStop.error && (
              <p className="mt-2 text-sm text-red-700">
                {(addStop.error as Error).message}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setAddingStop(false)}
                className="min-h-11 flex-1 rounded-xl px-4 py-2.5 text-base font-medium text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => addStop.mutate()}
                disabled={addStop.isPending}
                className="min-h-11 flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
              >
                {addStop.isPending ? "Adding…" : "Add stop"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingStop(true)}
            className="min-h-11 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-base font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
          >
            + Add stop
          </button>
        )}
      </div>
    </Card>
  );
}

function StopCard({
  stop,
  products,
  demand,
  onChanged,
}: {
  stop: Stop;
  products: { id: string; name: string | null }[];
  demand: DemandOption[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="mb-2 text-sm font-medium">
        Stop {stop.sequence} · {stop.customer_name ?? "—"}
      </p>

      <div className="space-y-2">
        {stop.load_lines.map((line) => (
          <LoadLineCard key={line.id} line={line} onChanged={onChanged} />
        ))}
      </div>

      {adding ? (
        <AddLoadLine
          stopId={stop.id}
          products={products}
          demand={demand}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 min-h-11 w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          + Load a product
        </button>
      )}
    </div>
  );
}

function AddLoadLine({
  stopId,
  products,
  demand,
  onDone,
  onCancel,
}: {
  stopId: string;
  products: { id: string; name: string | null }[];
  demand: DemandOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [soLineId, setSoLineId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  // Only orders for the chosen product can be loaded against — a mismatch
  // would consume the wrong reservation on completion.
  const matching = demand.filter((d) => d.finished_good_id === productId);

  const create = useMutation({
    mutationFn: () =>
      send("/api/ops-control/dispatch/load-lines", "POST", {
        stop_id: stopId,
        finished_good_id: productId,
        so_line_id: soLineId || null,
        planned_qty: Number(plannedQty),
      }),
    onSuccess: onDone,
  });

  return (
    <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <select
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          setSoLineId("");
        }}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name ?? "—"}
          </option>
        ))}
      </select>
      <select
        value={soLineId}
        onChange={(e) => setSoLineId(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
      >
        <option value="">No order (stock delivery)</option>
        {matching.map((d) => (
          <option key={d.id} value={d.id}>
            {d.order_name ?? "SO"} · {d.partner_name ?? "—"} · {qty(d.remaining)} due
          </option>
        ))}
      </select>
      <input
        type="number"
        inputMode="numeric"
        placeholder="Quantity to load"
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

/** The driver's report, and the §7 reconciliation shown live. */
function LoadLineCard({ line, onChanged }: { line: LoadLine; onChanged: () => void }) {
  const [loaded, setLoaded] = useState(String(line.actual_loaded_qty ?? ""));
  const [unloaded, setUnloaded] = useState(String(line.actual_unloaded_qty ?? ""));
  const [returned, setReturned] = useState(String(line.returned_qty || ""));
  const [damaged, setDamaged] = useState(String(line.damaged_qty || ""));
  const [short, setShort] = useState(String(line.lost_or_short_qty || ""));
  const done = line.status !== "draft";

  const saveDraft = () =>
    send<{ lock_version: number }>(
      `/api/ops-control/dispatch/load-lines/${line.id}`,
      "PATCH",
      {
        actual_loaded_qty: loaded === "" ? null : Number(loaded),
        actual_unloaded_qty: unloaded === "" ? null : Number(unloaded),
        returned_qty: Number(returned || 0),
        damaged_qty: Number(damaged || 0),
        lost_or_short_qty: Number(short || 0),
        lock_version: line.lock_version,
      },
    );

  const save = useMutation({ mutationFn: saveDraft, onSuccess: onChanged });

  /**
   * Complete SAVES FIRST, then completes with the lock_version the save
   * returns.
   *
   * The balanced check below is computed from what is on screen, but the
   * server completes from what is stored. Without this, typing figures that
   * balance and pressing Complete without saving would show "all accounted
   * for" and then fail against the old stored values — or worse, complete
   * against them.
   */
  const complete = useMutation({
    mutationFn: async () => {
      const saved = await saveDraft();
      return send(`/api/ops-control/dispatch/load-lines/${line.id}/complete`, "POST", {
        lock_version: saved.lock_version,
      });
    },
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: () => send(`/api/ops-control/dispatch/load-lines/${line.id}`, "DELETE"),
    onSuccess: onChanged,
  });

  // Computed from what is on screen, so the operator sees the effect of the
  // number they are typing rather than the last saved one.
  const loadedN = Number(loaded || 0);
  const accounted =
    Number(unloaded || 0) + Number(returned || 0) + Number(damaged || 0) + Number(short || 0);
  const unexplained = loadedN - accounted;
  const balanced = loadedN > 0 && unexplained === 0;

  if (done) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
        <span className="font-medium">{line.product_name ?? "—"}</span> delivered{" "}
        {qty(line.actual_unloaded_qty ?? 0)} of {qty(line.actual_loaded_qty ?? 0)} loaded.
        {line.returned_qty > 0 && ` ${qty(line.returned_qty)} returned.`}
        {line.damaged_qty > 0 && ` ${qty(line.damaged_qty)} damaged.`}
        {line.lost_or_short_qty > 0 && ` ${qty(line.lost_or_short_qty)} short.`}
        <span className="block text-xs opacity-80">Odoo sync pending.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {line.product_name ?? "—"}
          {line.order_name && (
            <span className="ml-1 text-xs text-slate-500">{line.order_name}</span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          planned {qty(line.planned_qty)}
          <button onClick={() => remove.mutate()} className="text-slate-400 underline">
            remove
          </button>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Num label="Loaded" value={loaded} onChange={setLoaded} />
        <Num label="Delivered" value={unloaded} onChange={setUnloaded} />
        <Num label="Returned" value={returned} onChange={setReturned} />
        <Num label="Damaged" value={damaged} onChange={setDamaged} />
        <Num label="Short" value={short} onChange={setShort} />
      </div>

      {loadedN > 0 && (
        <div className="mt-2 text-sm">
          {balanced ? (
            <p className="text-emerald-700 dark:text-emerald-300">
              All {qty(loadedN)} accounted for. Stock will fall by{" "}
              {qty(loadedN - Number(returned || 0))}; the customer is credited with{" "}
              {qty(Number(unloaded || 0))}.
            </p>
          ) : (
            <p className="text-amber-700 dark:text-amber-300">
              {qty(Math.abs(unexplained))}{" "}
              {unexplained > 0 ? "unexplained" : "over-accounted"} — every loaded brick
              must be delivered, returned, damaged or recorded as short.
            </p>
          )}
        </div>
      )}

      {(save.error || complete.error || remove.error) && (
        <p className="mt-2 text-sm text-red-700">
          {((save.error ?? complete.error ?? remove.error) as Error).message}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => {
            if (
              window.confirm(
                `Complete this delivery?\n\nStock falls by ${qty(loadedN - Number(returned || 0))} and the customer is credited with ${qty(Number(unloaded || 0))}. This cannot be edited afterwards — corrections become adjustments.`,
              )
            ) {
              complete.mutate();
            }
          }}
          disabled={!balanced || complete.isPending}
          className="min-h-11 flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-base font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {complete.isPending ? "Completing…" : "Complete"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Save as often as you like while the driver reports; Complete moves stock.
      </p>
    </div>
  );
}

function Num({
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
        className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-3 text-lg tabular-nums dark:border-slate-700 dark:bg-slate-800"
      />
    </label>
  );
}
