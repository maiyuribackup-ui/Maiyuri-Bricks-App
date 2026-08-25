/**
 * Operations Control — append-only audit trail (PRD §74).
 *
 * Modelled on logWorkEvent() in my-work-service.ts: best-effort, never blocks
 * the operation it records. An audit write failing must not roll back a
 * production entry the factory has already made physically.
 *
 * PRD §74 requires auditing at minimum: rate changes, consumption-standard
 * changes, vehicle-capacity changes, stock allocation and reallocation,
 * production allocation and reallocation, delivery schedule revisions,
 * customer confirmation, actual production and delivery edits, trip overrides,
 * labour approval and labour-period reopening.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";

/** Entities audited by this module. Kept as a union so a typo in a route
 *  becomes a compile error rather than an unsearchable audit row. */
export type OcAuditEntity =
  | "oc_settings"
  | "oc_activity_rates"
  | "oc_activity_types"
  | "oc_consumption_standards"
  | "oc_vehicles"
  | "oc_vehicle_capacities"
  | "oc_deviation_reasons"
  | "oc_product_mapping"
  | "oc_product_classification_overrides"
  | "oc_sales_order_lines"
  | "oc_site_locations"
  | "oc_delivery_schedules"
  | "oc_delivery_schedule_versions";

export type OcAuditAction =
  | "created"
  | "updated"
  | "deactivated"
  | "deleted"
  | "superseded"
  | "sent"
  | "confirmed"
  | "cancelled"
  | "revision_created";

export interface OcAuditEntry {
  entity: OcAuditEntity;
  /** TEXT rather than uuid: the settings singleton's key is not a uuid. */
  entity_id: string | null;
  action: OcAuditAction;
  before_value?: unknown;
  after_value?: unknown;
  reason?: string | null;
  performed_by?: string | null;
}

/**
 * Record an audit event. Failures are logged and swallowed.
 */
export async function logOcAudit(entry: OcAuditEntry): Promise<void> {
  const { error } = await supabaseAdmin.from("oc_audit_events").insert({
    entity: entry.entity,
    entity_id: entry.entity_id,
    action: entry.action,
    before_value: entry.before_value ?? null,
    after_value: entry.after_value ?? null,
    reason: entry.reason ?? null,
    performed_by: entry.performed_by ?? null,
  });
  if (error) {
    console.error(
      `[OpsControl] Failed to log audit event ${entry.entity}.${entry.action}:`,
      error,
    );
  }
}
