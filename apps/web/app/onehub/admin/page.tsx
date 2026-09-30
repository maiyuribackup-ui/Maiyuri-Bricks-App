"use client";

/**
 * OneHub Manage console — the missing management UI for capabilities that
 * only existed as APIs (completeness audit U1–U10): checklist builder,
 * recurring work templates, links editor, SOP editor, planning settings.
 * Server routes enforce roles; the client gate is UX only.
 */

import { useMemo, useState } from "react";
import {
  Calendar,
  ClipboardList,
  Link2,
  ListChecks,
  Plus,
  Settings2,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
} from "@/hooks/useMyWork";
import {
  useAdminLinks,
  useAdminSops,
  usePlanningSettings,
  useSaveLink,
  useSavePlanningSettings,
  useSaveSop,
  useSaveWorkTemplate,
  useStaff,
  useWorkTemplates,
  type AdminSop,
  type SopStep,
} from "@/hooks/useAdminConsole";
import { onehub } from "../theme";

const ADMIN_ROLES = ["founder", "owner", "production_supervisor"];

type TabKey = "checklists" | "recurring" | "links" | "sops" | "planning";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "checklists", label: "Checklists", icon: <ListChecks className="h-4 w-4" /> },
  { key: "recurring", label: "Recurring Work", icon: <Calendar className="h-4 w-4" /> },
  { key: "links", label: "Links", icon: <Link2 className="h-4 w-4" /> },
  { key: "sops", label: "SOPs", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "planning", label: "Planning", icon: <Settings2 className="h-4 w-4" /> },
];

/* ---------- shared field primitives (onehub theme) ---------- */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-xs font-semibold uppercase tracking-wider"
        style={{ color: onehub.textMuted }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2";

function inputStyle(): React.CSSProperties {
  return { borderColor: onehub.cardBorder, color: onehub.text };
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      style={{ background: onehub.accent }}
    >
      {children}
    </button>
  );
}

function StatusLine({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (error)
    return (
      <p className="mt-2 text-xs" style={{ color: "#c1453e" }}>
        {error}
      </p>
    );
  if (success)
    return (
      <p className="mt-2 text-xs" style={{ color: "#3f7d4d" }}>
        {success}
      </p>
    );
  return null;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: onehub.card, borderColor: onehub.cardBorder }}
    >
      {children}
    </div>
  );
}

/* ================= Checklist Builder ================= */

type NewItem = {
  /** present = existing template item (may be edited); absent = new */
  id?: string;
  prompt: string;
  input_type: "status" | "text" | "number";
  mandatory: boolean;
  allow_na: boolean;
  requires_photo: boolean;
  requires_photo_on_fail: boolean;
};

const blankItem = (): NewItem => ({
  prompt: "",
  input_type: "status",
  mandatory: true,
  allow_na: true,
  requires_photo: false,
  requires_photo_on_fail: true,
});

function ChecklistsTab() {
  const { data, isLoading } = useChecklistTemplates();
  const create = useCreateChecklistTemplate();
  const update = useUpdateChecklistTemplate();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<NewItem[]>([blankItem()]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const templates = data?.data ?? [];
  const formOpen = creating || editingId !== null;

  const setItem = (i: number, patch: Partial<NewItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const resetForm = () => {
    setCreating(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setItems([blankItem()]);
    setRemovedIds([]);
  };

  const startEdit = (t: (typeof templates)[number]) => {
    setMsg(null);
    setCreating(false);
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description ?? "");
    setRemovedIds([]);
    setItems(
      (t.items ?? []).map((it) => ({
        id: it.id,
        prompt: it.prompt,
        input_type: it.input_type,
        mandatory: it.mandatory,
        allow_na: it.allow_na,
        requires_photo: it.requires_photo,
        requires_photo_on_fail: it.requires_photo_on_fail,
      })),
    );
  };

  const removeItemAt = (i: number) => {
    const it = items[i];
    if (it.id) setRemovedIds((prev) => [...prev, it.id!]);
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const busy = create.isPending || update.isPending;

  const submit = () => {
    const clean = items.filter((i) => i.prompt.trim());
    if (!name.trim() || clean.length === 0) return;
    const payloadItems = clean.map((i) => ({
      ...(i.id ? { id: i.id } : {}),
      prompt: i.prompt.trim(),
      input_type: i.input_type,
      mandatory: i.mandatory,
      allow_na: i.allow_na,
      requires_photo: i.requires_photo,
      requires_photo_on_fail: i.requires_photo_on_fail,
      requires_corrective_action_on_fail: true,
    }));

    if (editingId) {
      update.mutate(
        {
          id: editingId,
          name: name.trim(),
          description: description.trim() || null,
          items: payloadItems,
          remove_item_ids: removedIds,
        },
        {
          onSuccess: (res) => {
            const kept = res.data?.kept_in_use?.length ?? 0;
            setMsg(
              kept > 0
                ? `“${name.trim()}” updated — ${kept} item${kept === 1 ? "" : "s"} kept (already answered in past runs)`
                : `“${name.trim()}” updated`,
            );
            resetForm();
          },
        },
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          description: description.trim() || null,
          items: payloadItems,
        },
        {
          onSuccess: () => {
            setMsg(`Checklist “${name.trim()}” created`);
            resetForm();
          },
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: onehub.textMuted }}>
          Checklists define the steps your team runs (assign them via My Work
          or a recurring template).
        </p>
        <PrimaryBtn
          onClick={() => {
            resetForm();
            setCreating(true);
            setMsg(null);
          }}
        >
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> New checklist
          </span>
        </PrimaryBtn>
      </div>
      <StatusLine
        error={
          create.isError
            ? (create.error as Error).message
            : update.isError
              ? (update.error as Error).message
              : null
        }
        success={msg}
      />

      {formOpen && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Checklist name">
              <input
                className={inputCls}
                style={inputStyle()}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Evening Shutdown Checklist"
              />
            </Field>
            <Field label="Description (optional)">
              <input
                className={inputCls}
                style={inputStyle()}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When/why this checklist runs"
              />
            </Field>
          </div>

          <p
            className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider"
            style={{ color: onehub.textMuted }}
          >
            Items ({items.length})
          </p>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div
                key={i}
                className="rounded-xl border p-3"
                style={{ borderColor: onehub.cardBorder }}
              >
                <div className="flex items-start gap-2">
                  <input
                    className={inputCls}
                    style={inputStyle()}
                    value={it.prompt}
                    onChange={(e) => setItem(i, { prompt: e.target.value })}
                    placeholder={`Item ${i + 1} — e.g. Mixer blades cleaned`}
                  />
                  <select
                    className="rounded-xl border px-2 py-2 text-sm"
                    style={inputStyle()}
                    value={it.input_type}
                    onChange={(e) =>
                      setItem(i, {
                        input_type: e.target.value as NewItem["input_type"],
                      })
                    }
                  >
                    <option value="status">✓ / ✗</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                  <button
                    onClick={() => removeItemAt(i)}
                    className="px-2 py-2 text-sm"
                    style={{ color: "#c1453e" }}
                    title={
                      it.id
                        ? "Remove (kept in past runs if already answered)"
                        : "Remove"
                    }
                  >
                    ✕
                  </button>
                </div>
                <div
                  className="mt-2 flex flex-wrap gap-4 text-xs"
                  style={{ color: onehub.textMuted }}
                >
                  {(
                    [
                      ["mandatory", "Mandatory"],
                      ["allow_na", "Allow N/A"],
                      ["requires_photo", "Photo always"],
                      ["requires_photo_on_fail", "Photo on fail"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={it[key]}
                        onChange={(e) => setItem(i, { [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setItems((prev) => [...prev, blankItem()])}
              className="rounded-xl border px-3 py-2 text-sm font-medium"
              style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}
            >
              + Add item
            </button>
            <button
              onClick={resetForm}
              className="rounded-xl border px-3 py-2 text-sm font-medium"
              style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}
            >
              Cancel
            </button>
            <PrimaryBtn
              onClick={submit}
              disabled={
                busy || !name.trim() || items.every((i) => !i.prompt.trim())
              }
            >
              {busy
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Create checklist"}
            </PrimaryBtn>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm" style={{ color: onehub.textMuted }}>
          Loading…
        </p>
      ) : (
        templates.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: onehub.text }}>
                  {t.name}
                </p>
                <p className="text-xs" style={{ color: onehub.textMuted }}>
                  {t.items?.length ?? 0} items
                  {t.description ? ` · ${t.description}` : ""}
                </p>
              </div>
              <button
                onClick={() => startEdit(t)}
                className="flex-shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: onehub.cardBorder, color: onehub.accent }}
              >
                ✏️ Edit
              </button>
            </div>
            {t.items?.length ? (
              <ol
                className="mt-2 list-decimal space-y-0.5 pl-5 text-sm"
                style={{ color: onehub.text }}
              >
                {t.items.map((it) => (
                  <li key={it.id}>
                    {it.prompt}
                    <span className="text-xs" style={{ color: onehub.textMuted }}>
                      {" "}
                      ({it.input_type}
                      {it.requires_photo ? " · 📷" : ""}
                      {it.requires_photo_on_fail ? " · 📷 on fail" : ""})
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}

/* ================= Recurring Work ================= */

const ROLE_OPTIONS = [
  "production_supervisor",
  "sales",
  "driver",
  "accountant",
  "engineer",
  "founder",
  "owner",
];

function RecurringTab() {
  const { data, isLoading } = useWorkTemplates();
  const save = useSaveWorkTemplate();
  const staff = useStaff();
  const checklists = useChecklistTemplates();
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    title: "",
    activity_type: "checklist" as "simple" | "checklist",
    checklist_template_id: "",
    assign_mode: "role" as "role" | "person",
    default_role: "production_supervisor",
    default_assigned_user_id: "",
    recurrence_kind: "daily" as "daily" | "weekly" | "monthly",
    recurrence_arg: "1",
    due_time: "08:00",
    priority: "high" as "low" | "medium" | "high" | "urgent",
    requires_approval: true,
    requires_photo: false,
    requires_note: false,
  });
  const set = (patch: Partial<typeof form>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const templates = data?.data ?? [];
  const activeStaff = (staff.data?.data ?? []).filter(
    (u) => u.is_active !== false,
  );

  const submit = () => {
    const rule =
      form.recurrence_kind === "daily"
        ? "daily"
        : `${form.recurrence_kind}:${form.recurrence_arg}`;
    save.mutate(
      {
        name: form.name.trim() || form.title.trim(),
        title: form.title.trim(),
        activity_type: form.activity_type,
        checklist_template_id:
          form.activity_type === "checklist" ? form.checklist_template_id : null,
        default_role: form.assign_mode === "role" ? form.default_role : null,
        default_assigned_user_id:
          form.assign_mode === "person" ? form.default_assigned_user_id : null,
        recurrence_rule: rule,
        due_time: form.due_time,
        priority: form.priority,
        requires_approval: form.requires_approval,
        requires_photo: form.requires_photo,
        requires_note: form.requires_note,
        active: true,
      },
      {
        onSuccess: () => {
          setMsg(`Recurring work “${form.title}” saved — first run tomorrow ~05:30 AM`);
          setCreating(false);
        },
      },
    );
  };

  const toggleActive = (id: string, tpl: Record<string, unknown>) =>
    save.mutate({ ...tpl, id, active: !tpl.active });

  const ruleLabel = (rule: string | null) => {
    if (!rule) return "—";
    if (rule === "daily") return "Every day";
    const [k, a] = rule.split(":");
    if (k === "weekly")
      return `Every ${["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(a)]}`;
    return `Monthly on day ${a}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: onehub.textMuted }}>
          Recurring work auto-appears in people&apos;s My Work each morning
          (generated ~05:30 AM IST).
        </p>
        <PrimaryBtn onClick={() => setCreating((v) => !v)}>
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> New recurring work
          </span>
        </PrimaryBtn>
      </div>
      <StatusLine
        error={save.isError ? (save.error as Error).message : null}
        success={msg}
      />

      {creating && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Task title (what people see)">
              <input
                className={inputCls}
                style={inputStyle()}
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="e.g. Production Opening Checklist"
              />
            </Field>
            <Field label="Type">
              <select
                className={inputCls}
                style={inputStyle()}
                value={form.activity_type}
                onChange={(e) =>
                  set({ activity_type: e.target.value as "simple" | "checklist" })
                }
              >
                <option value="checklist">Checklist</option>
                <option value="simple">Simple task</option>
              </select>
            </Field>
            {form.activity_type === "checklist" && (
              <Field label="Which checklist">
                <select
                  className={inputCls}
                  style={inputStyle()}
                  value={form.checklist_template_id}
                  onChange={(e) => set({ checklist_template_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {(checklists.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Assign to">
              <div className="flex gap-2">
                <select
                  className={inputCls}
                  style={inputStyle()}
                  value={form.assign_mode}
                  onChange={(e) =>
                    set({ assign_mode: e.target.value as "role" | "person" })
                  }
                >
                  <option value="role">Everyone with role…</option>
                  <option value="person">A specific person…</option>
                </select>
                {form.assign_mode === "role" ? (
                  <select
                    className={inputCls}
                    style={inputStyle()}
                    value={form.default_role}
                    onChange={(e) => set({ default_role: e.target.value })}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    className={inputCls}
                    style={inputStyle()}
                    value={form.default_assigned_user_id}
                    onChange={(e) =>
                      set({ default_assigned_user_id: e.target.value })
                    }
                  >
                    <option value="">Select…</option>
                    {activeStaff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </Field>
            <Field label="Repeats">
              <div className="flex gap-2">
                <select
                  className={inputCls}
                  style={inputStyle()}
                  value={form.recurrence_kind}
                  onChange={(e) =>
                    set({
                      recurrence_kind: e.target
                        .value as typeof form.recurrence_kind,
                    })
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                {form.recurrence_kind === "weekly" && (
                  <select
                    className={inputCls}
                    style={inputStyle()}
                    value={form.recurrence_arg}
                    onChange={(e) => set({ recurrence_arg: e.target.value })}
                  >
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (d, i) => (
                        <option key={d} value={String(i + 1)}>
                          {d}
                        </option>
                      ),
                    )}
                  </select>
                )}
                {form.recurrence_kind === "monthly" && (
                  <input
                    className={inputCls}
                    style={inputStyle()}
                    type="number"
                    min={1}
                    max={28}
                    value={form.recurrence_arg}
                    onChange={(e) => set({ recurrence_arg: e.target.value })}
                  />
                )}
              </div>
            </Field>
            <Field label="Due time (IST)">
              <input
                className={inputCls}
                style={inputStyle()}
                type="time"
                value={form.due_time}
                onChange={(e) => set({ due_time: e.target.value })}
              />
            </Field>
          </div>
          <div
            className="mt-3 flex flex-wrap gap-4 text-xs"
            style={{ color: onehub.textMuted }}
          >
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={(e) => set({ requires_approval: e.target.checked })}
              />
              Needs supervisor approval
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.requires_photo}
                onChange={(e) => set({ requires_photo: e.target.checked })}
              />
              Photo required
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.requires_note}
                onChange={(e) => set({ requires_note: e.target.checked })}
              />
              Note required
            </label>
          </div>
          <div className="mt-3">
            <PrimaryBtn
              onClick={submit}
              disabled={
                save.isPending ||
                !form.title.trim() ||
                (form.activity_type === "checklist" &&
                  !form.checklist_template_id) ||
                (form.assign_mode === "person" && !form.default_assigned_user_id)
              }
            >
              {save.isPending ? "Saving…" : "Save recurring work"}
            </PrimaryBtn>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm" style={{ color: onehub.textMuted }}>
          Loading…
        </p>
      ) : templates.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: onehub.textMuted }}>
            No recurring work yet — create the first one (e.g. the Production
            Opening Checklist, daily, role: production supervisor).
          </p>
        </Card>
      ) : (
        templates.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: onehub.text }}>
                  {t.title}
                  {!t.active && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: "#f4ece0", color: onehub.textMuted }}
                    >
                      paused
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: onehub.textMuted }}>
                  {ruleLabel(t.recurrence_rule)}
                  {t.due_time ? ` · due ${String(t.due_time).slice(0, 5)}` : ""} ·{" "}
                  {t.default_role
                    ? `role: ${t.default_role.replaceAll("_", " ")}`
                    : (t.default_assignee?.name ?? "—")}
                  {t.checklist_template ? ` · ☑ ${t.checklist_template.name}` : ""}
                  {t.requires_approval ? " · needs approval" : ""}
                </p>
              </div>
              <button
                onClick={() => toggleActive(t.id, t as unknown as Record<string, unknown>)}
                className="flex-shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: onehub.cardBorder,
                  color: t.active ? "#c1453e" : "#3f7d4d",
                }}
              >
                {t.active ? "Pause" : "Resume"}
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/* ================= Links ================= */

function LinksTab() {
  const { data, isLoading } = useAdminLinks();
  const save = useSaveLink();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ category: "", name: "", purpose: "", url: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const links = data?.data ?? [];

  const startEdit = (l?: (typeof links)[number]) => {
    setEditing(l?.id ?? "new");
    setForm({
      category: l?.category ?? "Operations",
      name: l?.name ?? "",
      purpose: l?.purpose ?? "",
      url: l?.url && l.url !== "https://" ? l.url : "https://",
    });
  };

  const submit = () => {
    save.mutate(
      {
        ...(editing !== "new" ? { id: editing! } : {}),
        category: form.category.trim(),
        name: form.name.trim(),
        purpose: form.purpose.trim() || null,
        url: form.url.trim(),
        sort_order: 0,
      },
      {
        onSuccess: () => {
          setMsg(`Link “${form.name}” saved`);
          setEditing(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: onehub.textMuted }}>
          These appear in OneHub → Important Links on web and mobile.
        </p>
        <PrimaryBtn onClick={() => startEdit()}>
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> Add link
          </span>
        </PrimaryBtn>
      </div>
      <StatusLine
        error={save.isError ? (save.error as Error).message : null}
        success={msg}
      />

      {editing && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className={inputCls} style={inputStyle()} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Brochure" />
            </Field>
            <Field label="Category">
              <input className={inputCls} style={inputStyle()} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Operations / Sales / Marketing" />
            </Field>
            <Field label="URL">
              <input className={inputCls} style={inputStyle()} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
            </Field>
            <Field label="Purpose (optional)">
              <input className={inputCls} style={inputStyle()} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="When to use this link" />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditing(null)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}>
              Cancel
            </button>
            <PrimaryBtn onClick={submit} disabled={save.isPending || !form.name.trim() || !/^https?:\/\/.+\..+/.test(form.url.trim())}>
              {save.isPending ? "Saving…" : "Save link"}
            </PrimaryBtn>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm" style={{ color: onehub.textMuted }}>Loading…</p>
      ) : (
        links.map((l) => (
          <Card key={l.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: onehub.text }}>
                  {l.name}
                  <span className="ml-2 text-xs font-normal" style={{ color: onehub.textMuted }}>
                    {l.category}
                  </span>
                </p>
                <p className="truncate text-xs" style={{ color: l.url === "https://" ? "#b3781a" : onehub.textMuted }}>
                  {l.url === "https://" ? "⚠ link not set yet" : l.url}
                </p>
              </div>
              <button onClick={() => startEdit(l)} className="flex-shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: onehub.cardBorder, color: onehub.accent }}>
                Edit
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/* ================= SOPs ================= */

const DEPARTMENTS = ["sales", "production", "dispatch", "accounts", "hr", "safety"];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function SopsTab() {
  const { data, isLoading } = useAdminSops();
  const save = useSaveSop();
  const [editing, setEditing] = useState<Partial<AdminSop> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sops = data?.data ?? [];

  const startNew = () =>
    setEditing({
      department: "sales",
      title_en: "",
      title_ta: "",
      purpose_en: "",
      steps: [{ en: "", ta: "", icon: "" }],
      warning_en: "",
      warning_ta: "",
      video_url: "",
      status: "draft",
    });

  const e = editing;
  const setE = (patch: Partial<AdminSop>) => setEditing((prev) => ({ ...prev!, ...patch }));
  const steps: SopStep[] = e?.steps ?? [];
  const setStep = (i: number, patch: Partial<SopStep>) =>
    setE({ steps: steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  const submit = (status: "draft" | "published") => {
    if (!e?.title_en?.trim()) return;
    save.mutate(
      {
        ...(e.id ? { id: e.id } : {}),
        department: e.department,
        slug: e.slug ?? slugify(e.title_en),
        title_en: e.title_en.trim(),
        title_ta: e.title_ta?.trim() || null,
        purpose_en: e.purpose_en?.trim() || null,
        purpose_ta: e.purpose_ta?.trim() || null,
        steps: steps
          .filter((s) => s.en.trim())
          .map((s) => ({ en: s.en.trim(), ta: s.ta?.trim() || "", icon: s.icon?.trim() || undefined })),
        warning_en: e.warning_en?.trim() || null,
        warning_ta: e.warning_ta?.trim() || null,
        video_url: e.video_url?.trim() || null,
        status,
      },
      {
        onSuccess: () => {
          setMsg(
            status === "published"
              ? `“${e.title_en}” published — live on web + mobile, Ask Mayur updated`
              : `Draft saved`,
          );
          setEditing(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: onehub.textMuted }}>
          Publish updates every surface instantly (web, mobile, Ask Mayur).
        </p>
        <PrimaryBtn onClick={startNew}>
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> New SOP
          </span>
        </PrimaryBtn>
      </div>
      <StatusLine error={save.isError ? (save.error as Error).message : null} success={msg} />

      {e && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department">
              <select className={inputCls} style={inputStyle()} value={e.department} onChange={(ev) => setE({ department: ev.target.value })}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Title (English)">
              <input className={inputCls} style={inputStyle()} value={e.title_en ?? ""} onChange={(ev) => setE({ title_en: ev.target.value })} />
            </Field>
            <Field label="Title (தமிழ்)">
              <input className={inputCls} style={inputStyle()} value={e.title_ta ?? ""} onChange={(ev) => setE({ title_ta: ev.target.value })} />
            </Field>
            <Field label="Purpose (English)">
              <input className={inputCls} style={inputStyle()} value={e.purpose_en ?? ""} onChange={(ev) => setE({ purpose_en: ev.target.value })} />
            </Field>
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider" style={{ color: onehub.textMuted }}>
            Steps ({steps.length})
          </p>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <input className="w-14 rounded-xl border px-2 py-2 text-center text-sm" style={inputStyle()} value={s.icon ?? ""} onChange={(ev) => setStep(i, { icon: ev.target.value })} placeholder="🔧" />
                <div className="flex-1 space-y-1.5">
                  <input className={inputCls} style={inputStyle()} value={s.en} onChange={(ev) => setStep(i, { en: ev.target.value })} placeholder={`Step ${i + 1} (English)`} />
                  <input className={inputCls} style={inputStyle()} value={s.ta ?? ""} onChange={(ev) => setStep(i, { ta: ev.target.value })} placeholder="படி (தமிழ்)" />
                </div>
                <button onClick={() => setE({ steps: steps.filter((_, idx) => idx !== i) })} className="px-2 py-2 text-sm" style={{ color: "#c1453e" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setE({ steps: [...steps, { en: "", ta: "", icon: "" }] })} className="mt-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}>
            + Add step
          </button>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="⚠ Warning (English)">
              <input className={inputCls} style={inputStyle()} value={e.warning_en ?? ""} onChange={(ev) => setE({ warning_en: ev.target.value })} />
            </Field>
            <Field label="⚠ Warning (தமிழ்)">
              <input className={inputCls} style={inputStyle()} value={e.warning_ta ?? ""} onChange={(ev) => setE({ warning_ta: ev.target.value })} />
            </Field>
            <Field label="Video URL (optional)">
              <input className={inputCls} style={inputStyle()} value={e.video_url ?? ""} onChange={(ev) => setE({ video_url: ev.target.value })} />
            </Field>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={() => setEditing(null)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}>
              Cancel
            </button>
            <button onClick={() => submit("draft")} disabled={save.isPending} className="rounded-xl border px-3 py-2 text-sm font-medium" style={{ borderColor: onehub.cardBorder, color: onehub.text }}>
              Save draft
            </button>
            <PrimaryBtn onClick={() => submit("published")} disabled={save.isPending || !e.title_en?.trim()}>
              {save.isPending ? "Saving…" : "Publish"}
            </PrimaryBtn>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm" style={{ color: onehub.textMuted }}>Loading…</p>
      ) : (
        sops.map((s) => (
          <Card key={s.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: onehub.text }}>
                  {s.title_en}
                  {s.status === "draft" && (
                    <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#f4ece0", color: onehub.textMuted }}>
                      draft
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: onehub.textMuted }}>
                  {s.department} · {s.steps.length} steps · v{s.version}
                </p>
              </div>
              <button onClick={() => setEditing(s)} className="flex-shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: onehub.cardBorder, color: onehub.accent }}>
                Edit
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/* ================= Planning settings ================= */

const DAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

function PlanningTab() {
  const { data, isLoading } = usePlanningSettings();
  const save = useSavePlanningSettings();
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState<{
    work_days: number[];
    max_deliveries_per_day: number;
    default_constraints_note: string;
  } | null>(null);

  const current = data?.data;
  const form = dirty ?? {
    work_days: current?.work_days ?? [1, 2, 3, 4, 5, 6],
    max_deliveries_per_day: current?.max_deliveries_per_day ?? 4,
    default_constraints_note: current?.default_constraints_note ?? "",
  };

  const toggleDay = (n: number) =>
    setDirty({
      ...form,
      work_days: form.work_days.includes(n)
        ? form.work_days.filter((d) => d !== n)
        : [...form.work_days, n].sort(),
    });

  if (isLoading)
    return <p className="text-sm" style={{ color: onehub.textMuted }}>Loading…</p>;

  return (
    <Card>
      <p className="text-sm" style={{ color: onehub.textMuted }}>
        The AI planner&apos;s global rules. Until now these were hardcoded —
        this is the first surface where they can be changed.
      </p>
      <div className="mt-4">
        <Field label="Factory working days">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d.n}
                onClick={() => toggleDay(d.n)}
                className="rounded-xl border px-3 py-1.5 text-sm font-medium"
                style={
                  form.work_days.includes(d.n)
                    ? { background: onehub.accent, color: "#fff", borderColor: onehub.accent }
                    : { borderColor: onehub.cardBorder, color: onehub.textMuted }
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Max deliveries per day">
          <input
            className={inputCls}
            style={inputStyle()}
            type="number"
            min={1}
            max={20}
            value={form.max_deliveries_per_day}
            onChange={(e) =>
              setDirty({ ...form, max_deliveries_per_day: Number(e.target.value) || 1 })
            }
          />
        </Field>
        <Field label="Standing constraints note (given to the AI)">
          <input
            className={inputCls}
            style={inputStyle()}
            value={form.default_constraints_note}
            onChange={(e) =>
              setDirty({ ...form, default_constraints_note: e.target.value })
            }
            placeholder="e.g. Machine service every second Saturday"
          />
        </Field>
      </div>
      <div className="mt-4">
        <PrimaryBtn
          onClick={() =>
            save.mutate(
              {
                work_days: form.work_days,
                max_deliveries_per_day: form.max_deliveries_per_day,
                default_constraints_note:
                  form.default_constraints_note.trim() || null,
              },
              { onSuccess: () => { setMsg("Planning settings saved"); setDirty(null); } },
            )
          }
          disabled={save.isPending || form.work_days.length === 0}
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </PrimaryBtn>
        <StatusLine error={save.isError ? (save.error as Error).message : null} success={msg} />
      </div>
    </Card>
  );
}

/* ================= Page shell ================= */

export default function OneHubAdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("checklists");
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? "");

  const body = useMemo(() => {
    switch (tab) {
      case "checklists":
        return <ChecklistsTab />;
      case "recurring":
        return <RecurringTab />;
      case "links":
        return <LinksTab />;
      case "sops":
        return <SopsTab />;
      case "planning":
        return <PlanningTab />;
    }
  }, [tab]);

  if (user && !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="font-semibold" style={{ color: onehub.text }}>
          Manage is for supervisors and leadership.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <h2 className="font-serif text-2xl font-bold" style={{ color: onehub.brand }}>
        Manage
      </h2>
      <p className="mt-0.5 text-sm" style={{ color: onehub.textMuted }}>
        Checklists, recurring work, links, SOPs and planning rules — the
        controls behind OneHub and My Work.
      </p>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium"
            style={
              tab === t.key
                ? { background: onehub.brand, color: "#fff", borderColor: onehub.brand }
                : { background: onehub.card, color: onehub.textMuted, borderColor: onehub.cardBorder }
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">{body}</div>
    </div>
  );
}
