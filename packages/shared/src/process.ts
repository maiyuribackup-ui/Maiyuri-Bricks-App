/**
 * Process OS — shared types + zod schemas.
 * Data model: supabase/migrations/20260912100000_process_os.sql
 * PRD: docs/PRD_PROCESS_OS.md · Plan: docs/PROCESS_OS_IMPLEMENTATION_PLAN.md
 *
 * A process DEFINITION is authored as the JSON shape validated by
 * `processDefinitionInputSchema` below, imported into normalised tables, and
 * frozen per VERSION. A process INSTANCE is one live case (a lead, an order)
 * moving through the stages of the version it started on.
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

export const processCategorySchema = z.enum([
  "SALES",
  "FACTORY",
  "DELIVERY",
  "FINANCE",
  "PROJECTS",
  "SAFETY",
]);
export type ProcessCategory = z.infer<typeof processCategorySchema>;

export const processVersionStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "RETIRED",
]);
export type ProcessVersionStatus = z.infer<typeof processVersionStatusSchema>;

export const processStageTypeSchema = z.enum([
  "ACTION",
  "DECISION",
  "HANDOVER",
  "WAIT",
  "AUTOMATION",
  "END",
]);
export type ProcessStageType = z.infer<typeof processStageTypeSchema>;

/** PRD roles are process-level keys mapped onto app roles server-side. */
export const processRoleKeySchema = z.enum([
  "SALES_ENGINEER",
  "FACTORY_MANAGER",
  "FINANCE",
  "MANAGING_PARTNER",
]);
export type ProcessRoleKey = z.infer<typeof processRoleKeySchema>;

export const processInstanceStatusSchema = z.enum([
  "active",
  "blocked",
  "completed",
  "cancelled",
]);
export type ProcessInstanceStatus = z.infer<typeof processInstanceStatusSchema>;

export const processStageInstanceStatusSchema = z.enum([
  "upcoming",
  "current",
  "completed",
  "blocked",
  "failed",
  "skipped",
  "cancelled",
]);
export type ProcessStageInstanceStatus = z.infer<
  typeof processStageInstanceStatusSchema
>;

export const processTaskStatusSchema = z.enum(["open", "done", "na"]);
export type ProcessTaskStatus = z.infer<typeof processTaskStatusSchema>;

export const processHandoverStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
]);
export type ProcessHandoverStatus = z.infer<typeof processHandoverStatusSchema>;

export const handoverRejectionCodeSchema = z.enum([
  "INSUFFICIENT_STOCK",
  "INSUFFICIENT_CURING_STOCK",
  "CAPACITY",
  "RAW_MATERIAL",
  "DATE_INFEASIBLE",
  "INCOMPLETE_PACKAGE",
  "OTHER",
]);
export type HandoverRejectionCode = z.infer<typeof handoverRejectionCodeSchema>;

export const processGateTypeSchema = z.enum([
  "checklist_complete",
  "entity_field",
  "odoo_quote_linked",
  "advance_verified",
  "handover_accepted",
  "stock_feasible",
  "manual_confirmation",
  "linked_record_status",
  "decision_outcome",
]);
export type ProcessGateType = z.infer<typeof processGateTypeSchema>;

/** Gates the database can verify by itself inside the transition RPC. */
export const DB_VERIFIED_GATE_TYPES: readonly ProcessGateType[] = [
  "checklist_complete",
  "handover_accepted",
  "decision_outcome",
  "manual_confirmation",
];

export const processAutomationActionSchema = z.enum([
  "SEND_NOTIFICATION",
  "CREATE_TASK",
  "ASSIGN_USER",
  "CREATE_HANDOVER",
  "UPDATE_STATUS",
  "CALL_WEBHOOK",
]);
export type ProcessAutomationAction = z.infer<
  typeof processAutomationActionSchema
>;

export const processEvidenceTypeSchema = z.enum([
  "quotation",
  "payment_reference",
  "photo",
  "drawing",
  "customer_confirmation",
  "lab_report",
  "delivery_ack",
  "qc_release",
  "note",
  "link",
]);
export type ProcessEvidenceType = z.infer<typeof processEvidenceTypeSchema>;

export const processEntityTypeSchema = z.enum([
  "lead",
  "sales_order",
  "delivery",
  "project",
  "generic",
]);
export type ProcessEntityType = z.infer<typeof processEntityTypeSchema>;

/** Domain events (PRD §32) — stored in process_events.event_type. */
export const PROCESS_EVENT_TYPES = [
  "process.started",
  "process.stage_started",
  "process.task_completed",
  "process.evidence_added",
  "process.gate_failed",
  "process.gate_overridden",
  "process.stage_completed",
  "process.blocked",
  "process.unblocked",
  "process.handover_requested",
  "process.handover_accepted",
  "process.handover_rejected",
  "process.sla_warning",
  "process.sla_breached",
  "process.completed",
  "process.cancelled",
  "process.version_published",
  "process.version_retired",
] as const;
export type ProcessEventType = (typeof PROCESS_EVENT_TYPES)[number];

export const processActorTypeSchema = z.enum(["user", "system", "ai"]);
export type ProcessActorType = z.infer<typeof processActorTypeSchema>;

// ============================================
// Definition input (authoring shape — JSON import / seed)
// ============================================

const keySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, "keys are UPPER_SNAKE_CASE");

export const processChecklistItemInputSchema = z.object({
  key: keySchema,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  required: z.boolean().default(true),
  evidence_required: z.boolean().default(false),
  evidence_type: processEvidenceTypeSchema.optional(),
});
export type ProcessChecklistItemInput = z.infer<
  typeof processChecklistItemInputSchema
>;

export const processGateInputSchema = z.object({
  key: keySchema,
  type: processGateTypeSchema,
  condition: z.record(z.unknown()).default({}),
  failure_message: z.string().max(500).optional(),
  /** false = even a Managing Partner cannot override (e.g. payment). */
  overridable: z.boolean().default(true),
});
export type ProcessGateInput = z.infer<typeof processGateInputSchema>;

export const processTransitionInputSchema = z.object({
  key: keySchema,
  to: keySchema,
  /** Gate keys that must pass and/or the DECISION outcome that selects it. */
  condition: z
    .object({
      gates: z.array(keySchema).optional(),
      outcome: z.string().max(64).optional(),
    })
    .default({}),
  priority: z.number().int().min(0).max(100).default(10),
  /** Exception edges may point backwards; normal edges may not create cycles. */
  is_exception: z.boolean().default(false),
  label: z.string().max(120).optional(),
});
export type ProcessTransitionInput = z.infer<
  typeof processTransitionInputSchema
>;

export const processAutomationInputSchema = z.object({
  event: z.enum(PROCESS_EVENT_TYPES),
  action: processAutomationActionSchema,
  configuration: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type ProcessAutomationInput = z.infer<
  typeof processAutomationInputSchema
>;

export const processStageConfigSchema = z
  .object({
    /** onehub_sops.slug for "How do I do this?" */
    sop_slug: z.string().max(120).optional(),
    /** Evidence types the stage panel offers to attach. */
    evidence_types: z.array(processEvidenceTypeSchema).optional(),
    /** For HANDOVER stages: payload fields the sender must fill. */
    handover_payload_fields: z.array(z.string()).optional(),
    /** For DECISION stages: allowed outcomes. */
    outcomes: z.array(z.string()).optional(),
    /** Outcomes that require a structured reason. */
    outcomes_requiring_reason: z.array(z.string()).optional(),
    /** Percentage of SLA after which a warning fires (default 80). */
    sla_warning_percent: z.number().int().min(1).max(99).optional(),
  })
  .passthrough();
export type ProcessStageConfig = z.infer<typeof processStageConfigSchema>;

export const processStageInputSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  type: processStageTypeSchema.default("ACTION"),
  owner_role: processRoleKeySchema,
  sla_minutes: z.number().int().positive().nullable().default(null),
  is_start: z.boolean().default(false),
  checklist: z.array(processChecklistItemInputSchema).default([]),
  gates: z.array(processGateInputSchema).default([]),
  transitions: z.array(processTransitionInputSchema).default([]),
  automations: z.array(processAutomationInputSchema).default([]),
  config: processStageConfigSchema.default({}),
});
export type ProcessStageInput = z.infer<typeof processStageInputSchema>;

export const processDefinitionInputSchema = z.object({
  process_key: keySchema,
  name: z.string().min(1).max(120),
  category: processCategorySchema,
  description: z.string().max(2000).optional(),
  version: z.string().regex(/^\d+\.\d+$/, "version is MAJOR.MINOR, e.g. 1.0"),
  entity_type: processEntityTypeSchema.default("generic"),
  stages: z.array(processStageInputSchema).min(1),
});
export type ProcessDefinitionInput = z.infer<
  typeof processDefinitionInputSchema
>;

// ============================================
// Row types (mirror the migration)
// ============================================

export interface ProcessDefinitionRow {
  id: string;
  process_key: string;
  name: string;
  category: ProcessCategory;
  description: string | null;
  entity_type: ProcessEntityType;
  status: "active" | "archived";
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessVersionRow {
  id: string;
  process_definition_id: string;
  version: string;
  status: ProcessVersionStatus;
  definition: ProcessDefinitionInput;
  published_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessStageRow {
  id: string;
  process_version_id: string;
  stage_key: string;
  name: string;
  description: string | null;
  stage_type: ProcessStageType;
  sequence: number;
  owner_role: ProcessRoleKey;
  sla_minutes: number | null;
  is_start: boolean;
  configuration: ProcessStageConfig;
}

export interface ProcessTransitionRow {
  id: string;
  process_version_id: string;
  from_stage_id: string;
  to_stage_id: string;
  transition_key: string;
  condition: { gates?: string[]; outcome?: string };
  priority: number;
  is_exception: boolean;
  label: string | null;
}

export interface ProcessChecklistItemRow {
  id: string;
  stage_id: string;
  item_key: string;
  title: string;
  description: string | null;
  required: boolean;
  sequence: number;
  evidence_required: boolean;
  configuration: { evidence_type?: ProcessEvidenceType };
}

export interface ProcessGateRow {
  id: string;
  stage_id: string;
  gate_key: string;
  gate_type: ProcessGateType;
  condition: Record<string, unknown>;
  failure_message: string | null;
  overridable: boolean;
}

export interface ProcessAutomationRow {
  id: string;
  stage_id: string;
  event: ProcessEventType;
  action_type: ProcessAutomationAction;
  configuration: Record<string, unknown>;
  enabled: boolean;
}

export interface ProcessRoleDefaultRow {
  role_key: ProcessRoleKey;
  user_id: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ProcessInstanceContext {
  customer_name?: string;
  product_name?: string;
  finished_good_id?: string;
  quantity?: number;
  requested_delivery_date?: string;
  odoo_order_id?: number;
  odoo_order_name?: string;
  oc_so_line_id?: string;
  site_location?: string;
  contact_person?: string;
  [key: string]: unknown;
}

export interface ProcessInstanceRow {
  id: string;
  process_definition_id: string;
  process_version_id: string;
  entity_type: ProcessEntityType;
  entity_id: string;
  status: ProcessInstanceStatus;
  current_stage_id: string | null;
  current_stage_instance_id: string | null;
  context: ProcessInstanceContext;
  imported_existing_case: boolean;
  import_source: string | null;
  imported_at: string | null;
  lock_version: number;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessBlockedReason {
  code: string;
  message: string;
  proposed_date?: string | null;
  gate_key?: string;
}

export interface ProcessStageInstanceRow {
  id: string;
  process_instance_id: string;
  process_stage_id: string;
  status: ProcessStageInstanceStatus;
  assigned_role: ProcessRoleKey;
  assigned_user_id: string | null;
  work_item_id: string | null;
  started_at: string;
  due_at: string | null;
  sla_warned_at: string | null;
  sla_breached_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  blocked_reason: ProcessBlockedReason | null;
  linked_record: { type: string; id: string } | null;
  outcome: string | null;
  outcome_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessTaskRow {
  id: string;
  stage_instance_id: string;
  checklist_item_id: string | null;
  item_key: string;
  title: string;
  description: string | null;
  status: ProcessTaskStatus;
  required: boolean;
  evidence_required: boolean;
  sequence: number;
  assigned_user_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProcessEvidenceRow {
  id: string;
  process_instance_id: string;
  stage_instance_id: string | null;
  task_id: string | null;
  evidence_type: ProcessEvidenceType;
  source_type: "storage" | "odoo" | "url" | "work_item_attachment" | "text";
  source_id: string | null;
  path: string | null;
  metadata: Record<string, unknown>;
  added_by: string | null;
  added_at: string;
}

export interface ProcessHandoverPayload {
  customer_name?: string;
  order_ref?: string;
  product_name?: string;
  finished_good_id?: string;
  quantity?: number;
  payment_status?: string;
  requested_delivery_date?: string;
  site_location?: string;
  contact_person?: string;
  contact_phone?: string;
  architect_or_builder?: string;
  attachments?: string[];
  special_requirements?: string;
  commitments?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ProcessHandoverRow {
  id: string;
  process_instance_id: string;
  stage_instance_id: string;
  from_role: ProcessRoleKey;
  from_user_id: string | null;
  to_role: ProcessRoleKey;
  to_user_id: string | null;
  status: ProcessHandoverStatus;
  payload: ProcessHandoverPayload;
  requested_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason_code: HandoverRejectionCode | null;
  rejection_comment: string | null;
  proposed_date: string | null;
  acted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessEventRow {
  id: string;
  process_instance_id: string;
  stage_instance_id: string | null;
  event_type: ProcessEventType;
  actor_type: ProcessActorType;
  actor_id: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// ============================================
// View models returned by the API
// ============================================

export interface ProcessGateResult {
  gate_key: string;
  gate_type: ProcessGateType;
  status: "ok" | "fail" | "unknown" | "overridden";
  message: string | null;
  overridable: boolean;
}

export interface ProcessStageView extends ProcessStageRow {
  checklist: ProcessChecklistItemRow[];
  gates: ProcessGateRow[];
  transitions: ProcessTransitionRow[];
}

export interface ProcessDefinitionView extends ProcessDefinitionRow {
  version: ProcessVersionRow | null;
  stages: ProcessStageView[];
  stage_count: number;
  owner_roles: ProcessRoleKey[];
}

/** One step of the journey strip (✓ ● ! ○). */
export interface ProcessJourneyStep {
  stage_id: string;
  stage_key: string;
  name: string;
  sequence: number;
  owner_role: ProcessRoleKey;
  stage_type: ProcessStageType;
  status: ProcessStageInstanceStatus;
  stage_instance_id: string | null;
  due_at: string | null;
}

export interface ProcessInstanceView {
  instance: ProcessInstanceRow;
  definition: Pick<
    ProcessDefinitionRow,
    "id" | "process_key" | "name" | "category"
  >;
  version: Pick<ProcessVersionRow, "id" | "version">;
  current_stage: ProcessStageView | null;
  current_stage_instance: ProcessStageInstanceRow | null;
  tasks: ProcessTaskRow[];
  gates: ProcessGateResult[];
  handover: ProcessHandoverRow | null;
  evidence: ProcessEvidenceRow[];
  journey: ProcessJourneyStep[];
  /** Transitions the caller may take from the current stage. */
  available_transitions: ProcessTransitionRow[];
  can_act: boolean;
}

export interface ProcessWorkStageItem {
  stage_instance: ProcessStageInstanceRow;
  stage: Pick<
    ProcessStageRow,
    "id" | "stage_key" | "name" | "stage_type" | "owner_role" | "sla_minutes"
  >;
  instance: Pick<
    ProcessInstanceRow,
    "id" | "entity_type" | "entity_id" | "status" | "context"
  >;
  definition: Pick<
    ProcessDefinitionRow,
    "id" | "process_key" | "name" | "category"
  >;
  open_task_count: number;
  required_open_task_count: number;
  is_overdue: boolean;
  handover: ProcessHandoverRow | null;
}

export interface ProcessWorkQueue {
  mine: ProcessWorkStageItem[];
  role: ProcessWorkStageItem[];
  handovers: ProcessWorkStageItem[];
  overdue: ProcessWorkStageItem[];
  summary: {
    mine: number;
    role: number;
    handovers: number;
    overdue: number;
  };
}

// ============================================
// Request bodies
// ============================================

export const startProcessSchema = z.object({
  process_key: keySchema,
  entity_type: processEntityTypeSchema,
  entity_id: z.string().min(1).max(120),
  context: z.record(z.unknown()).default({}),
  /** Controlled initialisation for existing cases (PRD §35). */
  start_stage_key: keySchema.optional(),
  imported_existing_case: z.boolean().default(false),
  import_source: z.string().max(120).optional(),
  assigned_user_id: z.string().uuid().optional(),
});
export type StartProcessInput = z.infer<typeof startProcessSchema>;

export const completeProcessTaskSchema = z.object({
  status: z.enum(["done", "na"]).default("done"),
  note: z.string().max(2000).optional(),
});
export type CompleteProcessTaskInput = z.infer<
  typeof completeProcessTaskSchema
>;

export const handoverPayloadSchema = z.record(z.unknown());

export const advanceProcessSchema = z.object({
  expected_stage_instance_id: z.string().uuid(),
  transition_key: keySchema.optional(),
  /** DECISION stages */
  outcome: z.string().max(64).optional(),
  outcome_reason: z.string().max(1000).optional(),
  /** Required when the target stage is a HANDOVER. */
  handover: z
    .object({
      to_user_id: z.string().uuid().optional(),
      payload: handoverPayloadSchema,
    })
    .optional(),
  linked_record: z
    .object({ type: z.string().max(60), id: z.string().max(120) })
    .optional(),
});
export type AdvanceProcessInput = z.infer<typeof advanceProcessSchema>;

export const blockProcessSchema = z.object({
  expected_stage_instance_id: z.string().uuid(),
  code: z.string().min(2).max(64),
  message: z.string().min(2).max(1000),
  proposed_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type BlockProcessInput = z.infer<typeof blockProcessSchema>;

export const unblockProcessSchema = z.object({
  expected_stage_instance_id: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

export const cancelProcessSchema = z.object({
  reason: z.string().min(3).max(1000),
});
export type CancelProcessInput = z.infer<typeof cancelProcessSchema>;

export const overrideGateSchema = z.object({
  stage_instance_id: z.string().uuid(),
  gate_key: keySchema,
  reason: z.string().min(5).max(1000),
});
export type OverrideGateInput = z.infer<typeof overrideGateSchema>;

export const addProcessEvidenceSchema = z.object({
  stage_instance_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  evidence_type: processEvidenceTypeSchema,
  source_type: z.enum([
    "storage",
    "odoo",
    "url",
    "work_item_attachment",
    "text",
  ]),
  source_id: z.string().max(200).optional(),
  path: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type AddProcessEvidenceInput = z.infer<typeof addProcessEvidenceSchema>;

export const createHandoverSchema = z.object({
  instance_id: z.string().uuid(),
  to_user_id: z.string().uuid().optional(),
  payload: handoverPayloadSchema,
});
export type CreateHandoverInput = z.infer<typeof createHandoverSchema>;

export const acceptHandoverSchema = z.object({
  comment: z.string().max(1000).optional(),
  /** Also complete the handover stage when its checklist is done (default true). */
  advance: z.boolean().default(true),
});
export type AcceptHandoverInput = z.infer<typeof acceptHandoverSchema>;

export const rejectHandoverSchema = z.object({
  reason_code: handoverRejectionCodeSchema,
  comment: z.string().min(3).max(1000),
  proposed_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type RejectHandoverInput = z.infer<typeof rejectHandoverSchema>;

export const setRoleDefaultSchema = z.object({
  role_key: processRoleKeySchema,
  user_id: z.string().uuid().nullable(),
});
export type SetRoleDefaultInput = z.infer<typeof setRoleDefaultSchema>;

export const importDefinitionSchema = z.object({
  definition: processDefinitionInputSchema,
  /** Publish immediately after import (admins seeding the reference process). */
  publish: z.boolean().default(false),
});
export type ImportDefinitionInput = z.infer<typeof importDefinitionSchema>;

/** Stable labels shared by web + native UI. */
export const PROCESS_ROLE_LABELS: Record<ProcessRoleKey, string> = {
  SALES_ENGINEER: "Sales / Project Engineer",
  FACTORY_MANAGER: "Factory Manager",
  FINANCE: "Finance / Accounts",
  MANAGING_PARTNER: "Managing Partner",
};

export const PROCESS_CATEGORY_LABELS: Record<ProcessCategory, string> = {
  SALES: "Sales",
  FACTORY: "Factory",
  DELIVERY: "Delivery",
  FINANCE: "Finance",
  PROJECTS: "Projects",
  SAFETY: "Safety",
};

export const HANDOVER_REJECTION_LABELS: Record<HandoverRejectionCode, string> =
  {
    INSUFFICIENT_STOCK: "Insufficient finished stock",
    INSUFFICIENT_CURING_STOCK: "Insufficient curing stock",
    CAPACITY: "Production capacity",
    RAW_MATERIAL: "Raw material shortage",
    DATE_INFEASIBLE: "Requested date not feasible",
    INCOMPLETE_PACKAGE: "Handover package incomplete",
    OTHER: "Other",
  };

/** Glyphs for the journey strip (PRD §25). */
export const PROCESS_STATUS_GLYPH: Record<ProcessStageInstanceStatus, string> =
  {
    completed: "✓",
    current: "●",
    blocked: "!",
    failed: "!",
    upcoming: "○",
    skipped: "–",
    cancelled: "×",
  };
