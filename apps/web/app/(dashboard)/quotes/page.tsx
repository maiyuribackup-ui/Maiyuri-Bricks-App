"use client";

/**
 * Quotes Inbox — every Smart Quote sent, with the engagement signals that
 * say "this customer is warm". The telemetry always existed; this page makes
 * it visible: opens, sections read, WhatsApp CTA taps, last activity.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  getQuoteSignal,
  isFollowUpOverdue,
  needsActionToday,
  type QuoteSignalTone,
} from "@/lib/quote-signals";

interface QuoteRow {
  id: string;
  link_slug: string;
  created_at: string;
  lead: {
    id: string;
    name: string;
    contact: string | null;
    pipeline_stage: string | null;
    owner_name: string | null;
    follow_up_date: string | null;
  } | null;
  viewCount: number;
  lastViewedAt: string | null;
  sectionViewCount: number;
  ctaClicked: boolean;
  lastEventAt: string | null;
}

const TONE_CLASS: Record<QuoteSignalTone, string> = {
  urgent: "bg-orange-100 text-orange-700",
  warm: "bg-amber-100 text-amber-700",
  chase: "bg-rose-100 text-rose-700",
  neutral: "bg-slate-100 text-slate-500",
};

function signalOf(q: QuoteRow) {
  return getQuoteSignal(
    {
      createdAt: q.created_at,
      viewCount: q.viewCount,
      ctaClicked: q.ctaClicked,
      lastViewedAt: q.lastViewedAt,
    },
  );
}

function useQuotesInbox() {
  return useQuery({
    queryKey: ["quotes-inbox"],
    queryFn: async () => {
      const res = await fetch("/api/smart-quotes");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load quotes");
      return body.data as QuoteRow[];
    },
    refetchInterval: 60_000,
  });
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Can we deliver?" — same engine as the mobile Plan tab, for sales on web. */
function PromiseChecker() {
  const products = useQuery({
    queryKey: ["ops-params"],
    queryFn: async () => {
      const res = await fetch("/api/ops-planning/params");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load products");
      return body.data as {
        finished_good_id: string;
        product_name: string;
        daily_capacity_units: number | null;
      }[];
    },
  });
  const [fg, setFg] = useState("");
  const [qty, setQty] = useState("");
  const check = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ops-planning/promise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finished_good_id: fg, quantity: Number(qty) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Check failed");
      return body.data as {
        promised_delivery_date: string | null;
        unfulfilled_units: number;
      };
    },
  });

  const list = (products.data ?? []).filter((p) => p.daily_capacity_units != null);
  if (!list.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">
        📦 Can we deliver? <span className="font-normal text-slate-400">— check before you promise a date</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={fg}
          onChange={(e) => setFg(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        >
          <option value="">Select product…</option>
          {list.map((p) => (
            <option key={p.finished_good_id} value={p.finished_good_id}>
              {p.product_name}
            </option>
          ))}
        </select>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Quantity"
          inputMode="numeric"
          className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => check.mutate()}
          disabled={!fg || !Number(qty) || check.isPending}
          className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {check.isPending ? "Checking…" : "Check"}
        </button>
        {check.data ? (
          <span
            className={`text-sm font-semibold ${check.data.promised_delivery_date ? "text-green-700" : "text-red-600"}`}
          >
            {check.data.promised_delivery_date
              ? `✅ Earliest delivery: ${new Date(check.data.promised_delivery_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
              : "⚠️ Cannot be fulfilled within 60 days"}
            {check.data.unfulfilled_units > 0
              ? ` (${check.data.unfulfilled_units.toLocaleString("en-IN")} short)`
              : ""}
          </span>
        ) : null}
        {check.isError ? (
          <span className="text-sm text-red-500">
            {check.error instanceof Error ? check.error.message : "Check failed"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function QuotesInboxPage() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuotesInbox();

  // Most urgent action first, then most recent activity.
  const rows = [...(data ?? [])].sort((a, b) => {
    const r = signalOf(b).rank - signalOf(a).rank;
    if (r !== 0) return r;
    return Date.parse(b.lastEventAt ?? b.created_at) - Date.parse(a.lastEventAt ?? a.created_at);
  });

  const todo = rows.filter((r) => needsActionToday(signalOf(r)));
  const callNow = rows.filter((r) => signalOf(r).key === "cta_clicked");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🧾 Quotes Inbox</h1>
          <p className="text-sm text-slate-500">
            Who received a quote, who opened it, who's about to buy.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          {isRefetching ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      <PromiseChecker />

      {callNow.length > 0 ? (
        <div className="mb-3 rounded-xl border border-orange-300 bg-orange-50 p-4">
          <div className="text-sm font-semibold text-orange-900">
            📞 Call now — {callNow.length} customer
            {callNow.length > 1 ? "s" : ""} asked to be contacted
          </div>
          <div className="mt-1 text-xs text-orange-800">
            {callNow.map((r) => r.lead?.name ?? r.link_slug).join(" · ")}
          </div>
        </div>
      ) : null}

      {todo.length > 0 ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">
            {todo.length} quote{todo.length > 1 ? "s" : ""} need action today
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Sorted below by urgency — clicked, then opened-but-stalled, then
            never opened.
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16 text-center text-slate-400">Loading quotes…</div>
      ) : isError ? (
        <div className="py-16 text-center text-red-500">
          {error instanceof Error ? error.message : "Failed to load"}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
          No quotes yet — generate one from any lead (web or the mobile app).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Signal</th>
                <th className="px-4 py-3">Do this</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const s = signalOf(q);
                const overdue = isFollowUpOverdue(q.lead?.follow_up_date);
                return (
                  <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {q.lead ? (
                        <Link
                          href={`/leads/${q.lead.id}`}
                          className="font-medium text-slate-900 hover:text-orange-600"
                        >
                          {q.lead.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">deleted lead</span>
                      )}
                      <div className="text-xs text-slate-400">
                        {q.lead?.pipeline_stage?.replaceAll("_", " ") ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[s.tone]}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-xs ${
                        s.rank >= 3 ? "font-semibold text-slate-900" : "text-slate-500"
                      }`}
                    >
                      {s.action}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {q.lead?.owner_name ?? (
                        <span className="text-xs text-rose-500">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {q.lead?.follow_up_date ? (
                        <span
                          className={
                            overdue
                              ? "text-xs font-semibold text-rose-600"
                              : "text-xs text-slate-600"
                          }
                        >
                          {shortDate(q.lead.follow_up_date)}
                          {overdue ? " · overdue" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{ago(q.lastEventAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/sq/${q.link_slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-xs font-medium text-sky-600 hover:underline"
                      >
                        View quote
                      </a>
                      {q.lead?.contact ? (
                        <a
                          href={`https://wa.me/${q.lead.contact.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                            `Vanakkam! Did you get a chance to see your Maiyuri Bricks quote? ${
                              typeof window !== "undefined" ? window.location.origin : "https://mb.maiyuri.com"
                            }/sq/${q.link_slug}`,
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-green-600 hover:underline"
                        >
                          WhatsApp
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
