/**
 * Process OS tools for the Maiyuri Intelligence Layer (PRD §16–17).
 *
 * Every tool is a plain function with a zod input schema, so the same
 * registry serves three consumers without duplication:
 *   1. POST /api/process/ai/tools  — the server-side runner (MCP / Hermes);
 *   2. /api/knowledge/ask          — context enrichment for Ask Mayur;
 *   3. apps/api agents             — CloudCore `AgentTool` wrappers over (1).
 *
 * `explain_next_action` is DETERMINISTIC: it composes the answer from the
 * active definition, the evaluated gates and the open tasks. The AI may
 * rephrase it; it may never invent a workflow (PRD §16).
 */
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthenticatedUser } from "@/lib/api-helpers";
import type { ProcessInstanceView, ProcessWorkQueue } from "@maiyuri/shared";
import { PROCESS_ROLE_LABELS } from "@maiyuri/shared";
import {
  getInstanceView,
  getViewForEntity,
  listEventsForInstance,
} from "./engine";
import { ProcessError } from "./errors";
import * as repo from "./repository";
import { loadWorkQueue } from "./work-queue";

export interface ProcessTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Hand-written JSON schema for consumers that cannot read zod. */
  inputJsonSchema: Record<string, unknown>;
  handler: (input: I, actor: AuthenticatedUser | null) => Promise<O>;
}

const uuid = z.string().uuid();

// ---------------------------------------------------------------- lookups --

const locateSchema = z
  .object({
    instance_id: uuid.optional(),
    entity_type: z.string().optional(),
    entity_id: z.string().optional(),
    /** Free text: customer name, phone or order ref ("Kumar", "SO1042"). */
    query: z.string().min(1).max(120).optional(),
  })
  .refine((v) => v.instance_id || (v.entity_type && v.entity_id) || v.query, {
    message: "Give instance_id, entity_type+entity_id, or query",
  });
type Locate = z.infer<typeof locateSchema>;

/** Find the live case a question is about. Returns null when nothing matches. */
export async function locateInstance(
  input: Locate,
  actor: AuthenticatedUser | null,
): Promise<ProcessInstanceView | null> {
  if (input.instance_id) return getInstanceView(input.instance_id, actor);
  if (input.entity_type && input.entity_id)
    return getViewForEntity(input.entity_type, input.entity_id, actor);
  const q = (input.query ?? "").trim();
  if (!q) return null;
  const safe = q.replace(/[%_,.\\]/g, " ").trim();
  // 1. live cases whose header mentions it
  const { data: byContext } = await supabaseAdmin
    .from("process_instances")
    .select("id")
    .in("status", ["active", "blocked"])
    .or(
      `context->>customer_name.ilike.%${safe}%,context->>odoo_order_name.ilike.%${safe}%`,
    )
    .order("started_at", { ascending: false })
    .limit(1);
  if (byContext?.[0]?.id)
    return getInstanceView(byContext[0].id as string, actor);
  // 2. a lead by name / phone that has a live case
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .limit(5);
  for (const l of leads ?? []) {
    const inst = await repo.getLiveInstanceForEntity("lead", l.id as string);
    if (inst) return getInstanceView(inst.id, actor);
  }
  return null;
}

function requireView(view: ProcessInstanceView | null): ProcessInstanceView {
  if (!view)
    throw new ProcessError(
      "INSTANCE_NOT_FOUND",
      "No live process case matches that",
    );
  return view;
}

function summariseStage(view: ProcessInstanceView) {
  const s = view.current_stage;
  const si = view.current_stage_instance;
  return s && si
    ? {
        stage_key: s.stage_key,
        name: s.name,
        sequence: s.sequence,
        type: s.stage_type,
        owner_role: s.owner_role,
        owner_label: PROCESS_ROLE_LABELS[s.owner_role],
        assigned_user_id: si.assigned_user_id,
        status: si.status,
        due_at: si.due_at,
        sla_breached: !!si.sla_breached_at,
        blocked_reason: si.blocked_reason,
        sop_slug: (s.configuration as { sop_slug?: string }).sop_slug ?? null,
        description: s.description,
      }
    : null;
}

function caseLabel(view: ProcessInstanceView): string {
  const c = view.instance.context;
  const name =
    (c.customer_name as string | undefined) ??
    `${view.instance.entity_type} ${view.instance.entity_id.slice(0, 8)}`;
  return c.odoo_order_name ? `${name} (${String(c.odoo_order_name)})` : name;
}

/** Plain-language next action, built only from the definition and facts. */
export function composeNextAction(view: ProcessInstanceView): {
  summary: string;
  steps: string[];
  blockers: string[];
  why: string | null;
} {
  const label = caseLabel(view);
  const stage = view.current_stage;
  if (!stage || !view.current_stage_instance) {
    return {
      summary: `${label} is ${view.instance.status}; there is no open stage.`,
      steps: [],
      blockers: [],
      why: null,
    };
  }
  const owner = PROCESS_ROLE_LABELS[stage.owner_role];
  const openTasks = view.tasks.filter((t) => t.status === "open");
  const failing = view.gates.filter(
    (g) => g.status === "fail" || g.status === "unknown",
  );
  const passed = view.gates.filter(
    (g) => g.status === "ok" || g.status === "overridden",
  );
  const steps: string[] = [];
  const blockers: string[] = [];

  if (
    view.instance.status === "blocked" &&
    view.current_stage_instance.blocked_reason
  ) {
    const r = view.current_stage_instance.blocked_reason;
    blockers.push(
      `Exception raised: ${r.code.replace(/_/g, " ").toLowerCase()} — ${r.message}${r.proposed_date ? ` (proposed ${r.proposed_date})` : ""}`,
    );
    steps.push(
      "Resolve the exception and clear it, or return the case along an exception path.",
    );
  }
  if (view.handover?.status === "PENDING") {
    steps.push(
      `Accept the handover from ${PROCESS_ROLE_LABELS[view.handover.from_role]} or return it with a structured reason.`,
    );
  }
  for (const t of openTasks)
    steps.push(`${t.required ? "" : "(optional) "}${t.title}`);
  for (const g of failing)
    blockers.push(
      `${g.gate_key.replace(/_/g, " ").toLowerCase()}: ${g.message ?? "not met"}`,
    );
  if (
    openTasks.length === 0 &&
    failing.length === 0 &&
    view.instance.status === "active" &&
    view.handover?.status !== "PENDING"
  ) {
    const next = view.available_transitions.find((t) => !t.is_exception);
    steps.push(
      next
        ? `Everything is in place — complete the stage${next.label ? ` (${next.label})` : ""}.`
        : "Complete the stage.",
    );
  }
  const done = passed.length
    ? ` ${passed.map((g) => g.gate_key.replace(/_/g, " ").toLowerCase()).join(", ")} ${passed.length === 1 ? "is" : "are"} confirmed.`
    : "";
  const summary = `${label} is at stage ${stage.sequence}, ${stage.name} (${owner}).${done}${
    openTasks.length
      ? ` ${openTasks.length} checklist item${openTasks.length === 1 ? "" : "s"} remain.`
      : ""
  }${failing.length ? ` Blocked by: ${failing.map((g) => g.gate_key.replace(/_/g, " ").toLowerCase()).join(", ")}.` : ""}`;
  return { summary, steps, blockers, why: stage.description };
}

// ---------------------------------------------------------------- registry --

const tools: ProcessTool[] = [
  {
    name: "get_process_definition",
    description:
      "The stages, owners, checklists, gates and transitions of a process (active version unless a version is given).",
    input: z.object({
      process_key: z.string().min(1),
      version: z.string().optional(),
    }),
    inputJsonSchema: {
      type: "object",
      properties: {
        process_key: { type: "string" },
        version: { type: "string" },
      },
      required: ["process_key"],
    },
    handler: async (input) => {
      const i = input as { process_key: string; version?: string };
      const def = await repo.getDefinitionView(
        i.process_key.toUpperCase(),
        i.version ?? null,
      );
      if (!def)
        throw new ProcessError(
          "PROCESS_NOT_FOUND",
          `No process ${i.process_key}`,
        );
      return {
        process_key: def.process_key,
        name: def.name,
        category: def.category,
        version: def.version?.version ?? null,
        status: def.version?.status ?? null,
        stages: def.stages.map((s) => ({
          sequence: s.sequence,
          key: s.stage_key,
          name: s.name,
          type: s.stage_type,
          owner_role: s.owner_role,
          owner_label: PROCESS_ROLE_LABELS[s.owner_role],
          sla_minutes: s.sla_minutes,
          description: s.description,
          checklist: s.checklist.map((c) => ({
            key: c.item_key,
            title: c.title,
            required: c.required,
          })),
          gates: s.gates.map((g) => ({
            key: g.gate_key,
            type: g.gate_type,
            failure_message: g.failure_message,
            overridable: g.overridable,
          })),
          transitions: s.transitions.map((t) => ({
            key: t.transition_key,
            to:
              def.stages.find((x) => x.id === t.to_stage_id)?.stage_key ?? "?",
            exception: t.is_exception,
            label: t.label,
          })),
          sop_slug: (s.configuration as { sop_slug?: string }).sop_slug ?? null,
        })),
      };
    },
  },
  {
    name: "get_active_process",
    description:
      "The live case for a lead/order: process, version, current stage, status, journey. Locate by instance_id, entity, or a free-text query (customer name / order ref).",
    input: locateSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string" },
        entity_type: { type: "string" },
        entity_id: { type: "string" },
        query: { type: "string" },
      },
    },
    handler: async (input, actor) => {
      const view = requireView(await locateInstance(input as Locate, actor));
      return {
        instance_id: view.instance.id,
        case: caseLabel(view),
        process: view.definition.name,
        process_key: view.definition.process_key,
        version: view.version.version,
        status: view.instance.status,
        entity: {
          type: view.instance.entity_type,
          id: view.instance.entity_id,
        },
        context: view.instance.context,
        current_stage: summariseStage(view),
        journey: view.journey.map((j) => ({
          sequence: j.sequence,
          key: j.stage_key,
          name: j.name,
          status: j.status,
          owner_role: j.owner_role,
        })),
      };
    },
  },
  {
    name: "get_current_process_stage",
    description:
      "Current stage of a case with its checklist status, gate results and handover.",
    input: locateSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string" },
        entity_type: { type: "string" },
        entity_id: { type: "string" },
        query: { type: "string" },
      },
    },
    handler: async (input, actor) => {
      const view = requireView(await locateInstance(input as Locate, actor));
      return {
        instance_id: view.instance.id,
        case: caseLabel(view),
        stage: summariseStage(view),
        tasks: view.tasks.map((t) => ({
          key: t.item_key,
          title: t.title,
          status: t.status,
          required: t.required,
        })),
        gates: view.gates,
        handover: view.handover
          ? {
              status: view.handover.status,
              from_role: view.handover.from_role,
              to_role: view.handover.to_role,
              rejection: view.handover.rejection_reason_code,
              proposed_date: view.handover.proposed_date,
            }
          : null,
      };
    },
  },
  {
    name: "get_user_process_tasks",
    description:
      "A user's process work queue: assigned stages, claimable role work, pending handovers and overdue items. Defaults to the calling user.",
    input: z.object({ user_id: uuid.optional() }),
    inputJsonSchema: {
      type: "object",
      properties: { user_id: { type: "string" } },
    },
    handler: async (input, actor) => {
      const i = input as { user_id?: string };
      let user = actor;
      if (i.user_id && i.user_id !== actor?.id) {
        const { data } = await supabaseAdmin
          .from("users")
          .select("id, email, role")
          .eq("id", i.user_id)
          .maybeSingle();
        if (!data)
          throw new ProcessError("INSTANCE_NOT_FOUND", "User not found", 404);
        user = {
          id: data.id as string,
          email: (data.email as string) ?? "",
          role: data.role as AuthenticatedUser["role"],
        };
      }
      if (!user) throw new ProcessError("FORBIDDEN", "A user is required");
      const q: ProcessWorkQueue = await loadWorkQueue(user);
      const brief = (items: ProcessWorkQueue["mine"]) =>
        items.map((w) => ({
          instance_id: w.instance.id,
          case:
            (w.instance.context.customer_name as string | undefined) ??
            `${w.instance.entity_type} ${w.instance.entity_id.slice(0, 8)}`,
          process: w.definition.name,
          stage: w.stage.name,
          owner_role: w.stage.owner_role,
          due_at: w.stage_instance.due_at,
          overdue: w.is_overdue,
          open_tasks: w.open_task_count,
          pending_handover: !!w.handover,
          work_item_id: w.stage_instance.work_item_id,
        }));
      return {
        summary: q.summary,
        mine: brief(q.mine),
        role: brief(q.role),
        handovers: brief(q.handovers),
        overdue: brief(q.overdue),
      };
    },
  },
  {
    name: "get_process_blockers",
    description:
      "Why a case cannot move: failing/unknown gates, open required tasks, pending handover, raised exception.",
    input: locateSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string" },
        entity_type: { type: "string" },
        entity_id: { type: "string" },
        query: { type: "string" },
      },
    },
    handler: async (input, actor) => {
      const view = requireView(await locateInstance(input as Locate, actor));
      const next = composeNextAction(view);
      return {
        instance_id: view.instance.id,
        case: caseLabel(view),
        stage: view.current_stage?.name ?? null,
        blockers: next.blockers,
        open_required_tasks: view.tasks
          .filter((t) => t.required && t.status === "open")
          .map((t) => t.title),
        pending_handover: view.handover?.status === "PENDING",
        exception: view.current_stage_instance?.blocked_reason ?? null,
        overridable_gates: view.gates
          .filter((g) => g.status !== "ok" && g.overridable)
          .map((g) => g.gate_key),
      };
    },
  },
  {
    name: "get_process_handover",
    description:
      "The latest handover of a case: package, sender, receiver, status and rejection details.",
    input: locateSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string" },
        entity_type: { type: "string" },
        entity_id: { type: "string" },
        query: { type: "string" },
      },
    },
    handler: async (input, actor) => {
      const view = requireView(await locateInstance(input as Locate, actor));
      return {
        instance_id: view.instance.id,
        case: caseLabel(view),
        handover: view.handover,
      };
    },
  },
  {
    name: "explain_next_action",
    description:
      "What exactly must happen now on a case, and why (PRD §16–17). Deterministic, from the active definition — rephrase, never invent.",
    input: locateSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string" },
        entity_type: { type: "string" },
        entity_id: { type: "string" },
        query: { type: "string" },
      },
    },
    handler: async (input, actor) => {
      const view = requireView(await locateInstance(input as Locate, actor));
      const next = composeNextAction(view);
      return {
        instance_id: view.instance.id,
        case: caseLabel(view),
        stage: summariseStage(view),
        ...next,
      };
    },
  },
  {
    name: "get_process_history",
    description: "The audit timeline of a case (who did what, when, why).",
    input: z.object({
      instance_id: uuid,
      limit: z.number().int().positive().max(200).default(50),
    }),
    inputJsonSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["instance_id"],
    },
    handler: async (input) => {
      const i = input as { instance_id: string; limit: number };
      const events = await listEventsForInstance(i.instance_id);
      return events.slice(-i.limit).map((e) => ({
        at: e.created_at,
        type: e.event_type,
        actor_id: e.actor_id,
        actor_type: e.actor_type,
        reason: e.reason,
        stage_key: (e.payload as { stage_key?: string }).stage_key ?? null,
        payload: Object.fromEntries(
          Object.entries(e.payload ?? {}).filter(
            ([k]) => k !== "dispatched_at",
          ),
        ),
      }));
    },
  },
  {
    name: "get_process_sla_risks",
    description:
      "Open stages ordered by SLA risk: overdue first, then closest to due.",
    input: z.object({
      limit: z.number().int().positive().max(100).default(20),
      process_key: z.string().optional(),
    }),
    inputJsonSchema: {
      type: "object",
      properties: {
        limit: { type: "integer" },
        process_key: { type: "string" },
      },
    },
    handler: async (input) => {
      const i = input as { limit: number; process_key?: string };
      let q = supabaseAdmin
        .from("v_process_open_work")
        .select("*")
        .not("due_at", "is", null)
        .order("due_at", { ascending: true })
        .limit(i.limit);
      if (i.process_key) q = q.eq("process_key", i.process_key.toUpperCase());
      const { data, error } = await q;
      if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
      return (data ?? []).map((r) => ({
        instance_id: r.process_instance_id,
        case:
          (r.context?.customer_name as string | undefined) ??
          `${r.entity_type} ${String(r.entity_id).slice(0, 8)}`,
        process: r.process_name,
        stage: r.stage_name,
        owner_role: r.assigned_role,
        assigned_user_id: r.assigned_user_id,
        due_at: r.due_at,
        overdue: r.is_overdue,
        open_tasks: r.open_tasks,
      }));
    },
  },
];

export const PROCESS_AI_TOOLS: readonly ProcessTool[] = tools;

export function toolManifest() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputJsonSchema,
  }));
}

export async function runProcessTool(
  name: string,
  rawInput: unknown,
  actor: AuthenticatedUser | null,
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool)
    throw new ProcessError("PROCESS_ERROR", `Unknown tool ${name}`, 404);
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new ProcessError(
      "DEFINITION_INVALID",
      parsed.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", "),
      400,
    );
  }
  return tool.handler(parsed.data, actor);
}

/**
 * Ask-Mayur enrichment: if the question is about a live case, return the
 * authoritative facts to prepend to the RAG prompt. Cheap and conservative —
 * only fires when a customer/order token in the question matches a case.
 */
export async function processContextForQuestion(
  question: string,
  actor: AuthenticatedUser | null,
): Promise<{ text: string; instance_id: string; label: string } | null> {
  const stop = new Set([
    "what",
    "should",
    "with",
    "order",
    "lead",
    "next",
    "about",
    "the",
    "and",
    "for",
    "this",
    "that",
    "customer",
    "case",
    "process",
    "stage",
    "do",
    "is",
    "of",
    "to",
    "in",
    "on",
    "how",
    "why",
    "when",
    "where",
    "who",
    "does",
    "need",
    "have",
    "status",
    "update",
    "delivery",
  ]);
  const tokens = question
    .replace(/[?!.,;:'"()]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/['’]s$/i, ""))
    .filter((t) => t.length >= 3 && !stop.has(t.toLowerCase()));
  // Prefer capitalised / alphanumeric refs like "Kumar" or "SO1042".
  const ordered = [...tokens].sort(
    (a, b) => Number(/^[A-Z]/.test(b)) - Number(/^[A-Z]/.test(a)),
  );
  for (const token of ordered.slice(0, 4)) {
    const view = await locateInstance({ query: token }, actor).catch(
      () => null,
    );
    if (!view) continue;
    const next = composeNextAction(view);
    const lines = [
      `Case: ${caseLabel(view)} — process "${view.definition.name}" v${view.version.version}, status ${view.instance.status}.`,
      next.summary,
      next.steps.length ? `Next steps: ${next.steps.join("; ")}` : "",
      next.blockers.length ? `Blockers: ${next.blockers.join("; ")}` : "",
      next.why ? `Why this stage exists: ${next.why}` : "",
    ].filter(Boolean);
    return {
      text: lines.join("\n"),
      instance_id: view.instance.id,
      label: caseLabel(view),
    };
  }
  return null;
}
