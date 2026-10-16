"use client";

/**
 * Renewals & Compliance register — visible to everyone on the OneHub page:
 * 🔴 overdue → 🟠 due soon → ⚪ upcoming, so leadership can act in advance.
 * Leadership/supervisor/accounts can add & edit inline. The daily generator
 * turns each entry into an assigned My Work task `remind_days_before` its
 * due date and rolls the date forward when the task is completed+approved.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { onehub } from "./theme";

const EDIT_ROLES = ["founder", "owner", "production_supervisor", "accountant"];

const CATEGORIES = [
  { value: "insurance", label: "Insurance", emoji: "🛡️" },
  { value: "tax", label: "Tax / GST", emoji: "🧾" },
  { value: "license", label: "License", emoji: "📜" },
  { value: "vehicle", label: "Vehicle", emoji: "🚚" },
  { value: "amc", label: "AMC / Service", emoji: "🔧" },
  { value: "other", label: "Other", emoji: "📌" },
] as const;

const CYCLES = [
  { value: "yearly", label: "Yearly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "one_time", label: "One-time" },
] as const;

interface Renewal {
  id: string;
  name: string;
  category: (typeof CATEGORIES)[number]["value"];
  due_date: string;
  cycle: (typeof CYCLES)[number]["value"];
  remind_days_before: number;
  owner_user_id: string | null;
  document_url: string | null;
  notes: string | null;
  status: "active" | "done" | "archived";
  owner?: { id: string; name: string | null } | null;
}

interface Staff {
  id: string;
  name: string | null;
  email: string;
  is_active?: boolean;
}

function daysLeft(dueISO: string): number {
  const today = new Date(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) +
      "T00:00:00Z",
  );
  const due = new Date(`${dueISO}T00:00:00Z`);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

const inputCls =
  "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { borderColor: onehub.cardBorder, color: onehub.text };

export function RenewalsCard() {
  const { user } = useAuthStore();
  const canEdit = EDIT_ROLES.includes(user?.role ?? "");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["renewals"],
    queryFn: async () => {
      const res = await fetch("/api/renewals");
      if (!res.ok) throw new Error("Failed to load renewals");
      return res.json() as Promise<{ data: Renewal[] }>;
    },
  });

  const { data: staffData } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to load staff");
      return res.json() as Promise<{ data: Staff[] }>;
    },
    enabled: canEdit,
  });

  const save = useMutation({
    mutationFn: async (input: Partial<Renewal>) => {
      const res = await fetch("/api/renewals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["renewals"] }),
  });

  const [editing, setEditing] = useState<Partial<Renewal> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const renewals = (data?.data ?? []).filter((r) => r.status === "active");
  const groups = useMemo(() => {
    const overdue = renewals.filter((r) => daysLeft(r.due_date) < 0);
    const soon = renewals.filter((r) => {
      const d = daysLeft(r.due_date);
      return d >= 0 && d <= Math.max(r.remind_days_before, 60);
    });
    const upcoming = renewals.filter(
      (r) => daysLeft(r.due_date) > Math.max(r.remind_days_before, 60),
    );
    return { overdue, soon, upcoming };
  }, [renewals]);

  const startNew = () =>
    setEditing({
      name: "",
      category: "insurance",
      due_date: "",
      cycle: "yearly",
      remind_days_before: 30,
      owner_user_id: null,
      document_url: "",
      notes: "",
      status: "active",
    });

  const submit = () => {
    if (!editing?.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(editing.due_date ?? "")) return;
    save.mutate(
      {
        ...(editing.id ? { id: editing.id } : {}),
        name: editing.name.trim(),
        category: editing.category,
        due_date: editing.due_date,
        cycle: editing.cycle,
        remind_days_before: editing.remind_days_before ?? 30,
        owner_user_id: editing.owner_user_id || null,
        document_url: editing.document_url?.trim() || null,
        notes: editing.notes?.trim() || null,
        status: editing.status ?? "active",
      },
      {
        onSuccess: () => {
          setMsg(`“${editing.name?.trim()}” saved — reminder task will appear ${editing.remind_days_before ?? 30} days before due`);
          setEditing(null);
        },
      },
    );
  };

  const Row = ({ r, tone }: { r: Renewal; tone: "bad" | "warn" | "ok" }) => {
    const d = daysLeft(r.due_date);
    const cat = CATEGORIES.find((c) => c.value === r.category);
    const toneStyle =
      tone === "bad"
        ? { bg: "#fbe4df", fg: "#c1453e" }
        : tone === "warn"
          ? { bg: "#f8ecd4", fg: "#b3781a" }
          : { bg: "#e4f1e3", fg: "#3f7d4d" };
    return (
      <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
        <span className="shrink-0 text-base">{cat?.emoji ?? "📌"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: onehub.text }}>
            {r.name}
            {r.document_url ? (
              <a
                href={r.document_url}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-xs underline"
                style={{ color: onehub.accent }}
              >
                doc
              </a>
            ) : null}
          </p>
          <p className="text-xs" style={{ color: onehub.textMuted }}>
            {new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}
            {" · "}
            {CYCLES.find((c) => c.value === r.cycle)?.label}
            {r.owner?.name ? ` · ${r.owner.name}` : ""}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: toneStyle.bg, color: toneStyle.fg }}
        >
          {d < 0 ? `${-d}d overdue` : d === 0 ? "today" : `in ${d}d`}
        </span>
        {canEdit && (
          <button
            onClick={() => setEditing(r)}
            className="shrink-0 text-xs font-semibold"
            style={{ color: onehub.accent }}
          >
            Edit
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" style={{ color: onehub.brand }} />
          <h3 className="font-serif text-lg font-bold" style={{ color: onehub.brand }}>
            Renewals &amp; Compliance
          </h3>
        </div>
        {canEdit && (
          <button
            onClick={startNew}
            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: onehub.accent }}
          >
            <Plus className="h-3.5 w-3.5" /> Add renewal
          </button>
        )}
      </div>

      {msg && (
        <p className="mb-2 text-xs" style={{ color: "#3f7d4d" }}>
          {msg}
        </p>
      )}
      {save.isError && (
        <p className="mb-2 text-xs" style={{ color: "#c1453e" }}>
          {(save.error as Error).message}
        </p>
      )}

      {editing && (
        <div
          className="mb-3 rounded-2xl border bg-white p-4"
          style={{ borderColor: onehub.cardBorder }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>
                What needs renewing
              </span>
              <input className={inputCls} style={inputStyle} value={editing.name ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, name: e.target.value }))} placeholder="e.g. Factory insurance — United India" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Category</span>
              <select className={inputCls} style={inputStyle} value={editing.category} onChange={(e) => setEditing((p) => ({ ...p!, category: e.target.value as Renewal["category"] }))}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Due / expiry date</span>
              <input className={inputCls} style={inputStyle} type="date" value={editing.due_date ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, due_date: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Repeats</span>
              <select className={inputCls} style={inputStyle} value={editing.cycle} onChange={(e) => setEditing((p) => ({ ...p!, cycle: e.target.value as Renewal["cycle"] }))}>
                {CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Remind days before</span>
              <input className={inputCls} style={inputStyle} type="number" min={0} max={180} value={editing.remind_days_before ?? 30} onChange={(e) => setEditing((p) => ({ ...p!, remind_days_before: Number(e.target.value) || 0 }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Owner (gets the task)</span>
              <select className={inputCls} style={inputStyle} value={editing.owner_user_id ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, owner_user_id: e.target.value || null }))}>
                <option value="">Founders (default)</option>
                {(staffData?.data ?? [])
                  .filter((s) => s.is_active !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.name ?? s.email}</option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Document link (optional)</span>
              <input className={inputCls} style={inputStyle} value={editing.document_url ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, document_url: e.target.value }))} placeholder="https://drive.google.com/…" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Notes (optional)</span>
              <input className={inputCls} style={inputStyle} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, notes: e.target.value }))} placeholder="Policy number, agent contact…" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setEditing(null)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}>
              Cancel
            </button>
            {editing.id && (
              <button
                onClick={() => {
                  setEditing((p) => ({ ...p!, status: "archived" }));
                  save.mutate(
                    { id: editing.id, name: editing.name, category: editing.category, due_date: editing.due_date, cycle: editing.cycle, remind_days_before: editing.remind_days_before, owner_user_id: editing.owner_user_id || null, status: "archived" },
                    { onSuccess: () => { setMsg("Archived"); setEditing(null); } },
                  );
                }}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "#e5c8c2", color: "#c1453e" }}
              >
                Archive
              </button>
            )}
            <button
              onClick={submit}
              disabled={save.isPending || !editing.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(editing.due_date ?? "")}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: onehub.accent }}
            >
              {save.isPending ? "Saving…" : "Save renewal"}
            </button>
          </div>
        </div>
      )}

      <div
        className="rounded-2xl border bg-white p-2"
        style={{ borderColor: onehub.cardBorder }}
      >
        {isLoading ? (
          <p className="px-2 py-3 text-sm" style={{ color: onehub.textMuted }}>Loading…</p>
        ) : renewals.length === 0 ? (
          <p className="px-2 py-3 text-sm" style={{ color: onehub.textMuted }}>
            No renewals tracked yet{canEdit ? " — add your insurance, tax and license dates so nothing slips." : "."}
          </p>
        ) : (
          <>
            {groups.overdue.length > 0 && (
              <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#c1453e" }}>Overdue</p>
            )}
            {groups.overdue.map((r) => <Row key={r.id} r={r} tone="bad" />)}
            {groups.soon.length > 0 && (
              <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#b3781a" }}>Due soon</p>
            )}
            {groups.soon.map((r) => <Row key={r.id} r={r} tone="warn" />)}
            {groups.upcoming.length > 0 && (
              <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: onehub.textMuted }}>Upcoming</p>
            )}
            {groups.upcoming.map((r) => <Row key={r.id} r={r} tone="ok" />)}
          </>
        )}
      </div>
    </div>
  );
}
