/**
 * Process OS tools for CloudCore agents (PRD §16).
 *
 * apps/web owns the engine, so these are thin HTTP wrappers over
 * POST /api/process/ai/tools authenticated with PROCESS_AI_TOKEN. The tool
 * list mirrors apps/web/src/lib/process/ai-tools.ts — keep them in step.
 */
import type { AgentTool } from "../types";

const TOOL_NAMES = [
  "get_process_definition",
  "get_active_process",
  "get_current_process_stage",
  "get_user_process_tasks",
  "get_process_blockers",
  "get_process_handover",
  "explain_next_action",
  "get_process_history",
  "get_process_sla_risks",
] as const;
export type ProcessToolName = (typeof TOOL_NAMES)[number];

const DESCRIPTIONS: Record<ProcessToolName, string> = {
  get_process_definition:
    "Stages, owners, checklists, gates and transitions of a process.",
  get_active_process:
    "The live case for a lead/order (by instance_id, entity, or a customer/order query).",
  get_current_process_stage:
    "Current stage with checklist status, gate results and handover.",
  get_user_process_tasks: "A user's process work queue.",
  get_process_blockers: "Why a case cannot move.",
  get_process_handover: "Latest handover of a case.",
  explain_next_action:
    "What must happen now on a case and why — deterministic from the definition.",
  get_process_history: "Audit timeline of a case.",
  get_process_sla_risks: "Open stages ordered by SLA risk.",
};

function baseUrl(): string {
  return (
    process.env.PROCESS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://mb.maiyuri.com"
  ).replace(/\/$/, "");
}

/** Call one Process OS tool through the web API. Throws on failure. */
export async function callProcessTool(
  tool: ProcessToolName,
  input: Record<string, unknown> = {},
  asUserId?: string,
): Promise<unknown> {
  const token = process.env.PROCESS_AI_TOKEN;
  if (!token) throw new Error("PROCESS_AI_TOKEN is not configured");
  const res = await fetch(`${baseUrl()}/api/process/ai/tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-process-ai-token": token,
    },
    body: JSON.stringify({ tool, input, as_user_id: asUserId }),
  });
  const body = (await res.json()) as {
    data?: { result?: unknown };
    error?: string | null;
  };
  if (!res.ok || body.error)
    throw new Error(
      body.error ?? `Process tool ${tool} failed (${res.status})`,
    );
  return body.data?.result ?? null;
}

const locateSchema = {
  type: "object",
  properties: {
    instance_id: { type: "string" },
    entity_type: { type: "string" },
    entity_id: { type: "string" },
    query: { type: "string", description: "Customer name, phone or order ref" },
  },
};

const INPUT_SCHEMAS: Record<ProcessToolName, object> = {
  get_process_definition: {
    type: "object",
    properties: {
      process_key: { type: "string" },
      version: { type: "string" },
    },
    required: ["process_key"],
  },
  get_active_process: locateSchema,
  get_current_process_stage: locateSchema,
  get_user_process_tasks: {
    type: "object",
    properties: { user_id: { type: "string" } },
  },
  get_process_blockers: locateSchema,
  get_process_handover: locateSchema,
  explain_next_action: locateSchema,
  get_process_history: {
    type: "object",
    properties: { instance_id: { type: "string" }, limit: { type: "integer" } },
    required: ["instance_id"],
  },
  get_process_sla_risks: {
    type: "object",
    properties: { limit: { type: "integer" }, process_key: { type: "string" } },
  },
};

/** AgentTool wrappers, optionally acting as a specific user. */
export function processAgentTools(asUserId?: string): AgentTool[] {
  return TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: INPUT_SCHEMAS[name],
    handler: (input: unknown) =>
      callProcessTool(name, (input ?? {}) as Record<string, unknown>, asUserId),
  }));
}
