"use client";

/**
 * Operations Control — Labour (PRD §57–§68).
 *
 * One factory week (Saturday to Friday) at a time, because that is the unit
 * the business actually pays on. The screen answers three questions in the
 * order they get asked:
 *
 *   1. What did this week earn, by activity?
 *   2. Is any work missing from that figure because it had no rate?
 *   3. Approve it — and then stop being able to change it.
 *
 * Two decisions worth stating, because both look like bugs otherwise:
 *
 * UNPRICED WORK IS NOT AN ERROR. The rate masters ship empty by design, so on
 * day one every earned brick lands in the exceptions panel. It is shown with
 * the one control that fixes it — enter the rate in Masters, then Price it —
 * rather than as a red failure.
 *
 * A LOCKED WEEK HAS NO REOPEN BUTTON. Not an omission: once money is paid,
 * §67 says a correction is a differential in the current open week, and the
 * database refuses a reopen independently. The screen says where the
 * correction goes instead of offering a door that is bolted shut.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";
import Link from "next/link";
import { factoryWeekEnd, factoryWeekStart } from "@/lib/factory";

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
const send = <T,>(url: string, payload: unknown) =>
  fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

type SettlementStatus = "draft" | "reviewed" | "approved" | "paid" | "locked";

interface LedgerEntry {
  id: string;
  entry_date: string;
  activity_code: string;
  product_name: string | null;
  source_type: string;
  eligible_qty: number;
  rate_applied: number;
  amount: number;
  settlement_id: string | null;
}
interface WeekSummary {
  week_start: string;
  week_end: string;
  by_activity: {
    activity_code: string;
    quantity: number;
    amount: number;
    entries: number;
  }[];
  total: number;
  entry_count: number;
  differential_count: number;
  differential_total: number;
}
interface Settlement {
  id: string;
  week_start: string;
  status: SettlementStatus;
  lock_version: number;
  approved_by: string | null;
  approved_at: string | null;
}
interface WeekPayload {
  summary: WeekSummary;
  entries: LedgerEntry[];
  settlement: Settlement | null;
  weeks: string[];
}
interface UnpricedRow {
  source_type: string;
  source_id: string;
  activity_code: string;
  product_name: string | null;
  entry_date: string;
  quantity: number;
}
interface UnpricedPayload {
  rows: UnpricedRow[];
  summary: {
    count: number;
    quantity: number;
    byActivity: { activity_code: string; count: number; quantity: number }[];
  };
}

const qty = (n: number) => Number(n).toLocaleString("en-IN");
const money = (n: number) =>
  `${n < 0 ? "-" : ""}Rs.${Math.abs(Number(n)).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const todayIso = () =>
  new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_CLASS: Record<SettlementStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  reviewed: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  locked: "bg-slate-900 text-white dark:bg-white dark:text-slate-900",
};

/** Forward only, one rung at a time — mirrors canTransition() on the server. */
const NEXT_STATUS: Record<SettlementStatus, SettlementStatus | null> = {
  draft: "reviewed",
  reviewed: "approved",
  approved: "paid",
  paid: "locked",
  locked: null,
};

function weekLabel(start: string, end: string) {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function LabourPage() {
  const [weekStart, setWeekStart] = useState<string>("");
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ops-labour"] });

  const week = useQuery<WeekPayload>({
    queryKey: ["ops-labour", "week", weekStart],
    queryFn: () =>
      fetchJson<WeekPayload>(
        `/api/ops-control/labour/week${weekStart ? `?week_start=${weekStart}` : ""}`,
      ),
    // Hold the previous week on screen while the next one loads. Without it
    // the picker empties itself mid-change and the operator loses their place.
    placeholderData: (prev) => prev,
  });

  const range = week.data?.summary;
  const unpriced = useQuery<UnpricedPayload>({
    queryKey: ["ops-labour", "unpriced", range?.week_start],
    enabled: Boolean(range),
    queryFn: () =>
      fetchJson<UnpricedPayload>(
        `/api/ops-control/labour/unpriced?from=${range!.week_start}&to=${range!.week_end}`,
      ),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Labour
            </h2>
            <p className="text-sm text-slate-500">
              Earned from work that was actually posted or completed, priced at
              the rate in force on the day. Saturday to Friday.
            </p>
          </div>
          <select
            value={weekStart || range?.week_start || ""}
            onChange={(e) => setWeekStart(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800"
          >
            {(week.data?.weeks ?? []).map((w) => (
              <option key={w} value={w}>
                {weekLabel(w, factoryWeekEnd(w))}
                {w === factoryWeekStart(todayIso()) ? " (this week)" : ""}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {week.isLoading ? (
        <Card className="flex justify-center p-14">
          <Spinner />
        </Card>
      ) : week.error ? (
        <Card className="p-6">
          <p className="text-sm text-red-700">{(week.error as Error).message}</p>
        </Card>
      ) : week.data ? (
        <>
          <WeekCard payload={week.data} onChanged={refresh} />
          <UnpricedCard
            state={unpriced}
            from={week.data.summary.week_start}
            to={week.data.summary.week_end}
            onChanged={refresh}
          />
          <LedgerCard entries={week.data.entries} />
        </>
      ) : null}
    </div>
  );
}

function WeekCard({
  payload,
  onChanged,
}: {
  payload: WeekPayload;
  onChanged: () => void;
}) {
  const { summary, settlement } = payload;
  const status: SettlementStatus = settlement?.status ?? "draft";
  const next = NEXT_STATUS[status];
  const [err, setErr] = useState<string | null>(null);

  const advance = useMutation({
    mutationFn: (to: SettlementStatus) =>
      send("/api/ops-control/labour/settlements", {
        week_start: summary.week_start,
        status: to,
        lock_version: settlement?.lock_version ?? null,
      }),
    onSuccess: () => {
      setErr(null);
      onChanged();
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {weekLabel(summary.week_start, summary.week_end)}
          </p>
          <p className="text-3xl font-semibold text-slate-900 dark:text-white">
            {money(summary.total)}
          </p>
          <p className="text-sm text-slate-500">
            {summary.entry_count} {summary.entry_count === 1 ? "entry" : "entries"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASS[status]}`}
        >
          {titleCase(status)}
        </span>
      </div>

      {summary.by_activity.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {summary.by_activity.map((a) => (
            <div
              key={a.activity_code}
              className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"
            >
              <p className="text-sm text-slate-500">{titleCase(a.activity_code)}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {money(a.amount)}
              </p>
              <p className="text-xs text-slate-500">{qty(a.quantity)} units</p>
            </div>
          ))}
        </div>
      )}

      {summary.differential_count > 0 && (
        // A negative entry is a correction to an already-settled week landing
        // here (§67). Calling it out stops the total looking wrong.
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Includes {summary.differential_count} correction
          {summary.differential_count === 1 ? "" : "s"} totalling{" "}
          {money(summary.differential_total)} carried in from an earlier settled
          week.
        </p>
      )}

      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {next ? (
          <button
            onClick={() => advance.mutate(next)}
            disabled={advance.isPending || summary.entry_count === 0}
            className="min-h-11 rounded-xl bg-slate-900 px-4 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {advance.isPending ? "Saving…" : `Mark ${titleCase(next)}`}
          </button>
        ) : (
          <p className="text-sm text-slate-500">
            This week is locked. A correction to it is recorded as a
            differential in the current open week, not by reopening this one.
          </p>
        )}
        {status === "reviewed" && (
          // Legal only below approval: once approved, money is committed and
          // the correction path is a differential, not an unapproval.
          <button
            onClick={() => advance.mutate("draft")}
            disabled={advance.isPending}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-base text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
          >
            Back to draft
          </button>
        )}
        {summary.entry_count === 0 && (
          <span className="text-sm text-slate-500">
            Nothing earned in this week yet.
          </span>
        )}
      </div>
    </Card>
  );
}

function UnpricedCard({
  state,
  from,
  to,
  onChanged,
}: {
  state: { data?: UnpricedPayload; isLoading: boolean };
  from: string;
  to: string;
  onChanged: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const backfill = useMutation({
    mutationFn: () =>
      send<{ entries_created: number; still_unpriced: number }>(
        "/api/ops-control/labour/backfill",
        { from, to },
      ),
    onSuccess: (r) => {
      setErr(null);
      setNote(
        r.entries_created > 0
          ? `Priced ${r.entries_created} ${r.entries_created === 1 ? "entry" : "entries"}.${
              r.still_unpriced > 0
                ? ` ${r.still_unpriced} still has no rate.`
                : ""
            }`
          : "Nothing could be priced — no rate covers this work yet. Add the rate in Masters first.",
      );
      onChanged();
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (state.isLoading) return null;
  const rows = state.data?.rows ?? [];
  if (rows.length === 0) {
    return note ? (
      <Card className="p-4">
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{note}</p>
      </Card>
    ) : null;
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Work with no rate
          </h3>
          <p className="text-sm text-slate-500">
            {rows.length} {rows.length === 1 ? "item" : "items"} covering{" "}
            {qty(state.data?.summary.quantity ?? 0)} units happened this week
            but is not in the total above, because no rate was configured for it
            on that date.{" "}
            <Link
              href="/ops/masters"
              className="font-medium underline underline-offset-2"
            >
              Add the rate in Masters
            </Link>
            , then price it here — it is paid at the rate in force on the day
            the work happened, not today&apos;s.
          </p>
        </div>
        <button
          onClick={() => backfill.mutate()}
          disabled={backfill.isPending}
          className="min-h-11 rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
        >
          {backfill.isPending ? "Pricing…" : "Price it"}
        </button>
      </div>

      {note && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{note}</p>}
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}

      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r) => (
          <li
            key={`${r.source_type}:${r.source_id}:${r.activity_code}`}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="text-slate-700 dark:text-slate-200">
              {titleCase(r.activity_code)} · {r.product_name ?? "Unnamed product"}
            </span>
            <span className="text-slate-500">
              {qty(r.quantity)} on {r.entry_date}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LedgerCard({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-slate-900 dark:text-white">Ledger</h3>
      <p className="text-sm text-slate-500">
        Each line keeps the rate it was priced at, so editing a rate master
        never changes what an earlier week earned.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 font-medium">Activity</th>
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-2 text-slate-600 dark:text-slate-300">
                  {e.entry_date}
                </td>
                <td className="py-2 text-slate-700 dark:text-slate-200">
                  {titleCase(e.activity_code)}
                </td>
                <td className="py-2 text-slate-700 dark:text-slate-200">
                  {e.product_name ?? "—"}
                </td>
                <td className="py-2 text-right text-slate-600 dark:text-slate-300">
                  {qty(e.eligible_qty)}
                </td>
                <td className="py-2 text-right text-slate-600 dark:text-slate-300">
                  {money(e.rate_applied)}
                </td>
                <td
                  className={`py-2 text-right font-medium ${
                    e.amount < 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {money(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
