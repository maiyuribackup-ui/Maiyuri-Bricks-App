/**
 * Event → notification mapping (PRD §15). Reuses the existing push (FCM,
 * respecting `push_ops`) and Telegram plumbing; never imports a provider
 * into the engine. Deep links: the mirrored My Work item when one exists
 * (resolves on web AND native), else the case page.
 */
import type { ProcessEventRow, ProcessRoleKey } from "@maiyuri/shared";
import {
  filterByPushPref,
  getUserIdsByRoles,
  isFcmConfigured,
  sendPushToUsers,
} from "@/lib/push/fcm";
import { sendAppNotification } from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PROCESS_ROLE_MAP } from "./permissions";

const PUSH_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`push timeout after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface NotifyDeps {
  push?: (
    userIds: string[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ) => Promise<unknown>;
  telegram?: (text: string) => Promise<unknown>;
}

async function safePush(
  userIds: (string | null | undefined)[],
  payload: { title: string; body: string; data?: Record<string, string> },
  deps: NotifyDeps,
): Promise<void> {
  const ids = [...new Set(userIds.filter((u): u is string => !!u))];
  if (ids.length === 0) return;
  try {
    if (deps.push) {
      await deps.push(ids, payload);
      return;
    }
    if (!isFcmConfigured()) return;
    const recipients = await filterByPushPref(ids, "push_ops");
    if (!recipients.length) return;
    await withTimeout(sendPushToUsers(recipients, payload), PUSH_TIMEOUT_MS);
  } catch (err) {
    console.error("[ProcessOS] push failed (ignored):", err);
  }
}

async function safeTelegram(text: string, deps: NotifyDeps): Promise<void> {
  try {
    await (deps.telegram ?? sendAppNotification)(text);
  } catch (err) {
    console.error("[ProcessOS] telegram failed (ignored):", err);
  }
}

async function usersOfProcessRole(roleKey: string): Promise<string[]> {
  const roles = PROCESS_ROLE_MAP[roleKey as ProcessRoleKey];
  if (!roles) return [];
  return getUserIdsByRoles([...roles]);
}

async function partnerIds(): Promise<string[]> {
  return getUserIdsByRoles([...PROCESS_ROLE_MAP.MANAGING_PARTNER]);
}

interface CaseHeader {
  label: string;
  process_name: string;
  stage_name: string | null;
  work_item_id: string | null;
  assigned_user_id: string | null;
  created_by: string | null;
}

async function caseHeader(ev: ProcessEventRow): Promise<CaseHeader> {
  const [{ data: inst }, { data: si }] = await Promise.all([
    supabaseAdmin
      .from("process_instances")
      .select(
        "context, entity_type, entity_id, created_by, definition:process_definitions(name)",
      )
      .eq("id", ev.process_instance_id)
      .maybeSingle(),
    ev.stage_instance_id
      ? supabaseAdmin
          .from("process_stage_instances")
          .select("work_item_id, assigned_user_id, stage:process_stages(name)")
          .eq("id", ev.stage_instance_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const ctx = (inst?.context ?? {}) as Record<string, unknown>;
  const name =
    (ctx.customer_name as string | undefined) ??
    `${inst?.entity_type ?? "case"} ${String(inst?.entity_id ?? "").slice(0, 8)}`;
  const ref = ctx.odoo_order_name as string | undefined;
  const def = inst?.definition as
    | { name?: string }
    | { name?: string }[]
    | null
    | undefined;
  const stage = si?.stage as
    | { name?: string }
    | { name?: string }[]
    | null
    | undefined;
  const pick = (
    v: { name?: string } | { name?: string }[] | null | undefined,
  ) => (Array.isArray(v) ? v[0]?.name : v?.name) ?? null;
  return {
    label: ref ? `${name} (${ref})` : name,
    process_name: pick(def) ?? "Process",
    stage_name: pick(stage),
    work_item_id: (si?.work_item_id as string | null) ?? null,
    assigned_user_id: (si?.assigned_user_id as string | null) ?? null,
    created_by: (inst?.created_by as string | null) ?? null,
  };
}

function urlFor(h: CaseHeader, instanceId: string): string {
  return h.work_item_id
    ? `/onehub/my-work/${h.work_item_id}`
    : `/processes/instances/${instanceId}`;
}

async function userName(id: string | null | undefined): Promise<string> {
  if (!id) return "Someone";
  const { data } = await supabaseAdmin
    .from("users")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return (data?.name as string | undefined) ?? "A colleague";
}

/** Route one event to the right people. Never throws. */
export async function notifyForEvent(
  ev: ProcessEventRow,
  deps: NotifyDeps = {},
): Promise<void> {
  const p = ev.payload ?? {};
  switch (ev.event_type) {
    case "process.stage_started": {
      const h = await caseHeader(ev);
      const assignee =
        (p.assigned_user_id as string | null) ?? h.assigned_user_id;
      if (!assignee || assignee === ev.actor_id) return; // you moved it yourself
      await safePush(
        [assignee],
        {
          title: `📋 ${h.stage_name ?? "New stage"}`,
          body: `${h.label} · ${h.process_name}`,
          data: { url: urlFor(h, ev.process_instance_id) },
        },
        deps,
      );
      return;
    }
    case "process.handover_requested": {
      const h = await caseHeader(ev);
      const toUser = p.to_user_id as string | null;
      const recipients = toUser
        ? [toUser]
        : await usersOfProcessRole(String(p.to_role ?? ""));
      const from = await userName(ev.actor_id);
      await safePush(
        recipients,
        {
          title: "🤝 Handover awaiting acceptance",
          body: `${h.label} from ${from}`,
          data: { url: urlFor(h, ev.process_instance_id) },
        },
        deps,
      );
      await safeTelegram(
        `🤝 Handover: ${h.label}\n${from} → ${String(p.to_role ?? "").replace(/_/g, " ")}\nOpen My Work to accept or return it.`,
        deps,
      );
      return;
    }
    case "process.handover_rejected": {
      const h = await caseHeader(ev);
      const { data: ho } = await supabaseAdmin
        .from("process_handovers")
        .select("from_user_id")
        .eq("id", String(p.handover_id ?? ""))
        .maybeSingle();
      const who = await userName(ev.actor_id);
      const reason = String(p.code ?? "")
        .replace(/_/g, " ")
        .toLowerCase();
      const date = p.proposed_date
        ? ` · proposed ${String(p.proposed_date)}`
        : "";
      await safePush(
        [ho?.from_user_id as string | null],
        {
          title: "↩️ Handover returned",
          body: `${h.label}: ${reason}${date}`,
          data: { url: `/processes/instances/${ev.process_instance_id}` },
        },
        deps,
      );
      await safeTelegram(
        `↩️ Handover returned by ${who}: ${h.label}\nReason: ${reason}${date}\n${ev.reason ?? ""}`.trim(),
        deps,
      );
      return;
    }
    case "process.handover_accepted": {
      const h = await caseHeader(ev);
      const who = await userName(ev.actor_id);
      await safePush(
        [p.from_user_id as string | null],
        {
          title: "✅ Handover accepted",
          body: `${h.label} accepted by ${who}`,
          data: { url: `/processes/instances/${ev.process_instance_id}` },
        },
        deps,
      );
      return;
    }
    case "process.sla_warning": {
      const h = await caseHeader(ev);
      await safePush(
        [p.assigned_user_id as string | null],
        {
          title: `⏳ ${h.stage_name ?? "Stage"} due soon`,
          body: h.label,
          data: { url: urlFor(h, ev.process_instance_id) },
        },
        deps,
      );
      return;
    }
    case "process.sla_breached": {
      const h = await caseHeader(ev);
      const partners = await partnerIds();
      await safePush(
        [p.assigned_user_id as string | null, ...partners],
        {
          title: `🔴 ${h.stage_name ?? "Stage"} overdue`,
          body: h.label,
          data: { url: urlFor(h, ev.process_instance_id) },
        },
        deps,
      );
      await safeTelegram(
        `🔴 SLA breached: ${h.stage_name ?? "stage"} — ${h.label}`,
        deps,
      );
      return;
    }
    case "process.blocked": {
      const h = await caseHeader(ev);
      const partners = await partnerIds();
      const who = await userName(ev.actor_id);
      await safePush(
        partners.filter((id) => id !== ev.actor_id),
        {
          title: `⚠️ Exception: ${String(p.code ?? "")
            .replace(/_/g, " ")
            .toLowerCase()}`,
          body: `${h.label} · ${h.stage_name ?? ""} · ${who}`,
          data: { url: `/processes/instances/${ev.process_instance_id}` },
        },
        deps,
      );
      return;
    }
    case "process.completed": {
      const h = await caseHeader(ev);
      await safePush(
        [h.created_by].filter((id) => id !== ev.actor_id),
        {
          title: "🏁 Process completed",
          body: `${h.label} · ${h.process_name}`,
          data: { url: `/processes/instances/${ev.process_instance_id}` },
        },
        deps,
      );
      return;
    }
    case "process.gate_overridden": {
      const h = await caseHeader(ev);
      const who = await userName(ev.actor_id);
      await safeTelegram(
        `🔓 Gate ${String(p.gate_key ?? "")} overridden by ${who} on ${h.label}\nReason: ${ev.reason ?? ""}`,
        deps,
      );
      return;
    }
    default:
      return;
  }
}
