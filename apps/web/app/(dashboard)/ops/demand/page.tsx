"use client";

/**
 * Operations Control — Demand (PRD §9, §12–§14).
 *
 * The open Odoo sales-order backlog, line by line, with the three status
 * dimensions kept deliberately separate: commitment (what the customer holds),
 * revision (what is being worked on), coverage (Phase 3 — shown as a neutral
 * dash, never a red "uncovered", because absence of information is not bad
 * news). Sync Now and the mapping link render only for production roles;
 * sales sees the facts without doors it cannot open.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Spinner } from "@maiyuri/ui";
import { useAuthStore } from "@/stores/authStore";

const PRODUCTION_ROLES = ["founder", "owner", "production_supervisor"];

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

const postJson = <T,>(url: string, payload?: unknown) =>
  fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

interface DemandLine {
  id: string;
  odoo_order_id: number;
  order_name: string;
  partner_name: string | null;
  product_name: string | null;
  qty_ordered: number;
  qty_delivered: number;
  remaining: number;
  scheduled_qty: number;
  confirmed_qty: number;
  commitment_status: string;
  revision_status: string;
  coverage_status: string;
  schedule_id: string | null;
}

interface DemandPayload {
  lines: DemandLine[];
  unmapped: { odoo_product_id: number; product_name: string | null; open_qty: number }[];
  last_sync: {
    status: string;
    started_at: string;
    completed_at: string | null;
    error: string | null;
  } | null;
  role: string;
}

interface ScheduleVersion {
  id: string;
  version_no: number;
  status: string;
  revision_reason: string | null;
  confirmation_note: string | null;
  oc_delivery_schedule_lines: {
    id: string;
    so_line_id: string;
    delivery_date: string;
    quantity: number;
  }[];
}

interface Schedule {
  id: string;
  order_name: string;
  status: string;
  lock_version: number;
  active_confirmed_version_id: string | null;
  versions: ScheduleVersion[];
}

const COMMITMENT_CHIP: Record<string, { label: string; cls: string }> = {
  unscheduled: { label: "Unscheduled", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  awaiting_confirmation: { label: "Awaiting confirmation", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" },
  partially_delivered: { label: "Partially delivered", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200" },
  completed: { label: "Completed", cls: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
};

const REVISION_CHIP: Record<string, string | null> = {
  none: null,
  draft_revision: "Revision in draft",
  sent_revision: "Revision sent",
  revision_requested: "Revision requested",
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default function OpsDemandPage() {
  const role = useAuthStore((s) => s.user?.role) ?? "";
  const isProduction = PRODUCTION_ROLES.includes(role);
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState("");
  const [openOrder, setOpenOrder] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const demandUrl = `/api/ops-control/demand${customer ? `?customer=${encodeURIComponent(customer)}` : ""}`;
  const q = useQuery({
    queryKey: ["oc", "demand", customer],
    queryFn: () => fetchJson<DemandPayload>(demandUrl),
  });

  const sync = useMutation({
    mutationFn: () => postJson<{ status: string; orders_fetched?: number }>("/api/ops-control/sales-orders/sync"),
    onSuccess: (run) => {
      setSyncMessage(`Sync complete — ${run.orders_fetched ?? 0} orders fetched.`);
      queryClient.invalidateQueries({ queryKey: ["oc", "demand"] });
    },
    onError: (err: Error) => setSyncMessage(err.message),
  });

  // One row per order in the dialog; the table stays per line.
  const orderLines = useMemo(() => {
    const map = new Map<number, DemandLine[]>();
    for (const l of q.data?.lines ?? []) {
      map.set(l.odoo_order_id, [...(map.get(l.odoo_order_id) ?? []), l]);
    }
    return map;
  }, [q.data?.lines]);

  const lastSync = q.data?.last_sync ?? null;
  const unmapped = q.data?.unmapped ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Filter by customer…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <div className="ml-auto flex items-center gap-3 text-sm">
          {lastSync && (
            <span className={lastSync.status === "error" ? "text-red-600" : "text-slate-500"}>
              {lastSync.status === "error"
                ? `Last sync failed: ${lastSync.error ?? "unknown error"}`
                : `Last synced ${timeAgo(lastSync.completed_at ?? lastSync.started_at)}`}
            </span>
          )}
          {!lastSync && !q.isLoading && (
            <span className="text-slate-500">Never synced</span>
          )}
          {isProduction && (
            <button
              type="button"
              onClick={() => {
                setSyncMessage(null);
                sync.mutate();
              }}
              disabled={sync.isPending}
              className="rounded-lg bg-slate-900 px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {sync.isPending ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      </div>
      {syncMessage && (
        <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {syncMessage}
        </p>
      )}

      {unmapped.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          <span className="font-medium">
            {unmapped.length} Odoo {unmapped.length === 1 ? "product carries" : "products carry"}{" "}
            {unmapped.reduce((a, u) => a + u.open_qty, 0).toLocaleString("en-IN")} units of open
            demand that is invisible to planning.
          </span>{" "}
          {isProduction ? (
            <Link href="/ops/masters" className="underline underline-offset-2">
              Map them in Masters → Odoo product mapping
            </Link>
          ) : (
            <span>These products require mapping by Operations.</span>
          )}
        </div>
      )}

      <Card className="p-0">
        {q.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : q.error ? (
          <p className="px-4 py-6 text-sm text-red-700">{(q.error as Error).message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-700">
                  {["Order", "Customer", "Product", "Ordered", "Delivered", "Remaining", "Scheduled", "Confirmed", "Commitment", "Coverage"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(q.data?.lines ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-14 text-center text-slate-400">
                      No open demand.{" "}
                      {isProduction
                        ? "Run a sync to pull the current Odoo sales orders."
                        : "The Odoo sales-order sync has not brought any in yet."}
                    </td>
                  </tr>
                ) : (
                  q.data!.lines.map((l) => {
                    const chip = COMMITMENT_CHIP[l.commitment_status];
                    const revision = REVISION_CHIP[l.revision_status] ?? null;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setOpenOrder(l.odoo_order_id)}
                        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-4 py-3 font-medium">{l.order_name}</td>
                        <td className="px-4 py-3">{l.partner_name ?? "—"}</td>
                        <td className="px-4 py-3">{l.product_name ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums">{Number(l.qty_ordered).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 tabular-nums">{Number(l.qty_delivered).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 tabular-nums font-medium">{Number(l.remaining).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 tabular-nums">{Number(l.scheduled_qty).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 tabular-nums">{Number(l.confirmed_qty).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${chip?.cls ?? ""}`}>
                            {chip?.label ?? l.commitment_status}
                          </span>
                          {revision && (
                            <span className="ml-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
                              {revision}
                            </span>
                          )}
                        </td>
                        {/* Coverage is not evaluated until Phase 3 supplies
                            reservation data — a dash, never a red warning. */}
                        <td className="px-4 py-3 text-slate-400">—</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openOrder !== null && (
        <ScheduleDialog
          odooOrderId={openOrder}
          demandLines={orderLines.get(openOrder) ?? []}
          onClose={() => {
            setOpenOrder(null);
            queryClient.invalidateQueries({ queryKey: ["oc", "demand"] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule dialog — versions, draft editing, send / confirm / cancel, PDF.
// ---------------------------------------------------------------------------

interface EditableLine {
  so_line_id: string;
  delivery_date: string;
  quantity: string; // input state; validated on save
}

const VERSION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent — awaiting customer",
  confirmed: "Confirmed",
  revision_requested: "Revision requested",
  superseded: "Superseded",
  cancelled: "Cancelled",
};

function ScheduleDialog({
  odooOrderId,
  demandLines,
  onClose,
}: {
  odooOrderId: number;
  demandLines: DemandLine[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<EditableLine[] | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [confirmNote, setConfirmNote] = useState("");

  const q = useQuery({
    queryKey: ["oc", "schedule", odooOrderId],
    queryFn: () => fetchJson<Schedule | null>(`/api/ops-control/schedules?odoo_order_id=${odooOrderId}`),
  });
  const schedule = q.data ?? null;
  const orderName = demandLines[0]?.order_name ?? schedule?.order_name ?? `Order ${odooOrderId}`;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["oc", "schedule", odooOrderId] });
    setEditLines(null);
    setOverrideReason("");
  };

  const act = useMutation({
    mutationFn: ({ url, payload }: { url: string; payload?: unknown }) => postJson<unknown>(url, payload),
    onSuccess: () => {
      setMessage(null);
      refresh();
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const saveLines = useMutation({
    mutationFn: async (vars: { url: string; method: "POST" | "PUT"; payload: unknown }) =>
      fetchJson<unknown>(vars.url, {
        method: vars.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars.payload),
      }),
    onSuccess: () => {
      setMessage(null);
      refresh();
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const toPayloadLines = (lines: EditableLine[]) =>
    lines.map((l) => ({
      so_line_id: l.so_line_id,
      delivery_date: l.delivery_date,
      quantity: Number(l.quantity),
    }));

  const linesValid = (lines: EditableLine[]) =>
    lines.length > 0 &&
    lines.every((l) => l.so_line_id && /^\d{4}-\d{2}-\d{2}$/.test(l.delivery_date) && Number(l.quantity) > 0);

  const openVersion = schedule?.versions.find((v) =>
    ["draft", "sent", "revision_requested"].includes(v.status),
  );
  const hasConfirmed = !!schedule?.active_confirmed_version_id;

  const startEditing = (version?: ScheduleVersion) => {
    setEditLines(
      version
        ? version.oc_delivery_schedule_lines.map((l) => ({
            so_line_id: l.so_line_id,
            delivery_date: l.delivery_date,
            quantity: String(l.quantity),
          }))
        : demandLines.map((d) => ({
            so_line_id: d.id,
            delivery_date: "",
            quantity: String(d.remaining),
          })),
    );
  };

  const productFor = (soLineId: string) =>
    demandLines.find((d) => d.id === soLineId)?.product_name ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Delivery schedule — {orderName}
            </h2>
            <p className="text-sm text-slate-500">
              Versions are immutable once sent; a change is a new revision the
              customer sees as V{(schedule?.versions[0]?.version_no ?? 0) + 1}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {message && (
          <p className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {message}
          </p>
        )}

        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !schedule && editLines === null ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-slate-500">
              No schedule exists for this order yet.
            </p>
            <button
              type="button"
              onClick={() => startEditing()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
            >
              Draft a schedule
            </button>
          </div>
        ) : null}

        {/* Line editor: creating V1, or editing an existing draft version */}
        {editLines !== null && (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Quantity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {editLines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-2 pr-2">
                      <select
                        value={l.so_line_id}
                        onChange={(e) =>
                          setEditLines(editLines.map((x, j) => (j === i ? { ...x, so_line_id: e.target.value } : x)))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-700"
                      >
                        {demandLines.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.product_name ?? d.id} (open {d.remaining})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="date"
                        value={l.delivery_date}
                        onChange={(e) =>
                          setEditLines(editLines.map((x, j) => (j === i ? { ...x, delivery_date: e.target.value } : x)))
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) =>
                          setEditLines(editLines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
                        }
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 tabular-nums dark:border-slate-600 dark:bg-slate-700"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditLines(editLines.filter((_, j) => j !== i))}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setEditLines([
                    ...editLines,
                    { so_line_id: demandLines[0]?.id ?? "", delivery_date: "", quantity: "" },
                  ])
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
              >
                + Add delivery
              </button>
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Over-schedule override reason (if needed)"
                className="min-w-64 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditLines(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!linesValid(editLines) || saveLines.isPending}
                onClick={() => {
                  const payloadLines = toPayloadLines(editLines);
                  const override = overrideReason.trim() || null;
                  if (schedule && openVersion?.status === "draft") {
                    saveLines.mutate({
                      url: `/api/ops-control/schedules/${schedule.id}/versions/${openVersion.id}/lines`,
                      method: "PUT",
                      payload: {
                        lock_version: schedule.lock_version,
                        lines: payloadLines,
                        overschedule_override_reason: override,
                      },
                    });
                  } else {
                    saveLines.mutate({
                      url: "/api/ops-control/schedules",
                      method: "POST",
                      payload: {
                        odoo_order_id: odooOrderId,
                        lines: payloadLines,
                        overschedule_override_reason: override,
                      },
                    });
                  }
                }}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {saveLines.isPending ? "Saving…" : "Save draft"}
              </button>
            </div>
          </div>
        )}

        {/* Versions list */}
        {schedule && editLines === null && (
          <div className="space-y-3">
            {!openVersion && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
                {hasConfirmed && (
                  <input
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                    placeholder="Reason for revising the confirmed schedule"
                    className="min-w-64 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                  />
                )}
                <button
                  type="button"
                  disabled={act.isPending || (hasConfirmed && !revisionReason.trim())}
                  onClick={() =>
                    act.mutate({
                      url: `/api/ops-control/schedules/${schedule.id}/versions`,
                      payload: { revision_reason: revisionReason.trim() || null },
                    })
                  }
                  className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  New revision
                </button>
              </div>
            )}

            {schedule.versions.map((v) => {
              const isActiveConfirmed = v.id === schedule.active_confirmed_version_id;
              return (
                <div
                  key={v.id}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">V{v.version_no}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isActiveConfirmed
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {VERSION_STATUS_LABEL[v.status] ?? v.status}
                    </span>
                    {v.revision_reason && (
                      <span className="text-xs text-slate-500">“{v.revision_reason}”</span>
                    )}
                    <div className="ml-auto flex gap-2">
                      <a
                        href={`/api/ops-control/schedules/${schedule.id}/pdf?version=${v.version_no}`}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-600"
                      >
                        PDF
                      </a>
                      {v.status === "draft" && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditing(v)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-600"
                          >
                            Edit lines
                          </button>
                          <button
                            type="button"
                            disabled={act.isPending}
                            onClick={() =>
                              act.mutate({
                                url: `/api/ops-control/schedules/${schedule.id}/versions/${v.id}/send`,
                              })
                            }
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-slate-900"
                          >
                            Send
                          </button>
                        </>
                      )}
                      {v.status === "sent" && (
                        <button
                          type="button"
                          disabled={act.isPending}
                          onClick={() =>
                            act.mutate({
                              url: `/api/ops-control/schedules/${schedule.id}/versions/${v.id}/confirm`,
                              payload: {
                                lock_version: schedule.lock_version,
                                confirmation_note: confirmNote.trim() || null,
                              },
                            })
                          }
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white"
                        >
                          Customer confirmed
                        </button>
                      )}
                      {["draft", "sent", "revision_requested"].includes(v.status) && (
                        <button
                          type="button"
                          disabled={act.isPending}
                          onClick={() =>
                            act.mutate({
                              url: `/api/ops-control/schedules/${schedule.id}/versions/${v.id}/cancel`,
                            })
                          }
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-600"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {v.status === "sent" && (
                    <input
                      value={confirmNote}
                      onChange={(e) => setConfirmNote(e.target.value)}
                      placeholder="Confirmation note (how the customer confirmed)"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                    />
                  )}
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {[...v.oc_delivery_schedule_lines]
                        .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
                        .map((l) => (
                          <tr key={l.id} className="border-t border-slate-50 dark:border-slate-700/50">
                            <td className="py-1.5 text-slate-500">{l.delivery_date}</td>
                            <td className="py-1.5">{productFor(l.so_line_id)}</td>
                            <td className="py-1.5 text-right tabular-nums">
                              {Number(l.quantity).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
