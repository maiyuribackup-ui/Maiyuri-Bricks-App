/**
 * Collect the facts a stage's gates need — once — from Supabase, ops-control
 * and Odoo. Every external read is isolated: a failure is recorded in
 * `facts.errors` and only the gates that depend on it turn UNKNOWN.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  ProcessEvidenceRow,
  ProcessGateRow,
  ProcessHandoverRow,
  ProcessInstanceRow,
  ProcessStageInstanceRow,
  ProcessTaskRow,
} from "@maiyuri/shared";
import { emptyFacts, type GateFacts } from "../gates";
import { getLatestQcRelease } from "../repository";
import type { RoleDefaults } from "../permissions";
import { readOrderPaymentStatus } from "./odoo";
import { readOrderStockPosition } from "./ops-control";

const LEAD_FIELDS =
  "id, name, phone, pipeline_stage, lead_status, assigned_staff, created_by, odoo_lead_id, odoo_quote_id, odoo_quote_number, odoo_order_id, odoo_order_number, next_action, follow_up_date";

export interface FactSources {
  entity?: (
    type: string,
    id: string,
  ) => Promise<Record<string, unknown> | null>;
  payment?: typeof readOrderPaymentStatus;
  stock?: typeof readOrderStockPosition;
  linkedStatus?: (type: string, id: string) => Promise<string | null>;
  qcRelease?: (stageInstanceId: string) => Promise<GateFacts["qc_release"]>;
}

async function defaultEntity(
  type: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (type !== "lead") return null;
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select(LEAD_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load lead: ${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

async function defaultLinkedStatus(
  type: string,
  id: string,
): Promise<string | null> {
  const table =
    type === "delivery" ? "deliveries" : type === "trip" ? "oc_trips" : null;
  if (!table) return null;
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load ${type}: ${error.message}`);
  return (data?.status as string | undefined) ?? null;
}

async function defaultQcRelease(
  stageInstanceId: string,
): Promise<GateFacts["qc_release"]> {
  const qc = await getLatestQcRelease(stageInstanceId);
  if (!qc) return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", qc.checked_by)
    .maybeSingle();
  if (error) throw new Error(`Failed to load QC checker: ${error.message}`);
  return { ...qc, checked_by_role: (data?.role as string | undefined) ?? null };
}

async function safe<T>(
  name: string,
  facts: GateFacts,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    facts.errors[name] = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export interface CollectInput {
  instance: ProcessInstanceRow;
  stageInstance: ProcessStageInstanceRow;
  gates: ProcessGateRow[];
  tasks: ProcessTaskRow[];
  evidence: (ProcessEvidenceRow & { added_by_role?: string | null })[];
  handover: ProcessHandoverRow | null;
  overridden: Set<string>;
  outcome?: string | null;
  roleDefaults?: RoleDefaults;
}

/** Resolve the Odoo order id from the instance context or the linked lead. */
function orderIdFrom(
  instance: ProcessInstanceRow,
  entity: Record<string, unknown> | null,
): number | null {
  const fromCtx = instance.context?.odoo_order_id;
  if (typeof fromCtx === "number" && fromCtx > 0) return fromCtx;
  const fromLead = entity?.odoo_order_id;
  return typeof fromLead === "number" && fromLead > 0 ? fromLead : null;
}

export async function collectFacts(
  input: CollectInput,
  sources: FactSources = {},
): Promise<GateFacts> {
  const facts = emptyFacts();
  facts.tasks = input.tasks;
  facts.evidence = input.evidence;
  facts.handover = input.handover;
  facts.overridden = input.overridden;
  facts.outcome = input.outcome ?? null;
  facts.role_defaults = input.roleDefaults ?? {};

  const types = new Set(input.gates.map((g) => g.gate_type));
  const needsEntity =
    types.has("entity_field") ||
    types.has("odoo_quote_linked") ||
    types.has("advance_verified") ||
    types.has("stock_feasible");

  if (needsEntity) {
    facts.entity = await safe("entity", facts, () =>
      (sources.entity ?? defaultEntity)(
        input.instance.entity_type,
        input.instance.entity_id,
      ),
    );
  }

  const orderId = orderIdFrom(input.instance, facts.entity);

  const advanceGate = input.gates.find(
    (g) => g.gate_type === "advance_verified",
  );
  if (advanceGate && advanceGate.condition.auto_from_odoo === true) {
    if (orderId)
      facts.payment = await safe("payment", facts, () =>
        (sources.payment ?? readOrderPaymentStatus)(orderId),
      );
    else facts.errors.payment = "No Odoo sales order is linked yet";
  }

  const stockGate = input.gates.find((g) => g.gate_type === "stock_feasible");
  if (stockGate) {
    if (orderId) {
      const asOfKey =
        typeof stockGate.condition.as_of === "string"
          ? stockGate.condition.as_of
          : "requested_delivery_date";
      const asOf = input.instance.context?.[asOfKey];
      facts.stock = await safe("stock", facts, () =>
        (sources.stock ?? readOrderStockPosition)(
          orderId,
          typeof asOf === "string" ? asOf : null,
        ),
      );
    } else facts.errors.stock = "No Odoo sales order is linked yet";
  }

  if (types.has("qc_released")) {
    facts.qc_release = await safe("qc_release", facts, () =>
      (sources.qcRelease ?? defaultQcRelease)(input.stageInstance.id),
    );
  }

  if (types.has("linked_record_status") && input.stageInstance.linked_record) {
    const { type, id } = input.stageInstance.linked_record;
    const status = await safe("linked_record", facts, () =>
      (sources.linkedStatus ?? defaultLinkedStatus)(type, id),
    );
    facts.linked_record = { type, id, status };
  }

  return facts;
}
