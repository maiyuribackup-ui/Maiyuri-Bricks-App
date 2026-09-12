/**
 * Process roles → app roles (PRD §6, §23). Mirrors `process_role_app_roles()`
 * in the migration; the database re-checks every mutation, this layer gives
 * early, friendly 403s and drives what the UI offers.
 */
import type { ProcessRoleKey, UserRole } from "@maiyuri/shared";
import { canWorkOnLead } from "@/lib/sales-access";

export const PROCESS_ROLE_MAP: Record<ProcessRoleKey, readonly UserRole[]> = {
  SALES_ENGINEER: ["sales", "engineer"],
  FACTORY_MANAGER: ["production_supervisor"],
  FINANCE: ["accountant"],
  MANAGING_PARTNER: ["founder", "owner"],
};

export const PARTNER_ROLES: readonly UserRole[] = ["founder", "owner"];

export function isManagingPartner(role: string | null | undefined): boolean {
  return !!role && (PARTNER_ROLES as readonly string[]).includes(role);
}

/** founder/owner satisfy every process role. */
export function userHasProcessRole(
  role: string | null | undefined,
  roleKey: ProcessRoleKey,
): boolean {
  if (!role) return false;
  if (isManagingPartner(role)) return true;
  return (PROCESS_ROLE_MAP[roleKey] as readonly string[]).includes(role);
}

/** Every process role this app role can act as. */
export function processRolesFor(
  role: string | null | undefined,
): ProcessRoleKey[] {
  return (Object.keys(PROCESS_ROLE_MAP) as ProcessRoleKey[]).filter((k) =>
    userHasProcessRole(role, k),
  );
}

export interface StageActor {
  id: string;
  role: string;
}

/**
 * May this user act on a stage instance? Assignee always; otherwise anyone
 * holding the stage's role. For lead-scoped stages the sales-access rule of
 * the rest of the app applies too, so an accountant cannot work a colleague's
 * lead just because a process role matches.
 */
export function canActOnStage(
  actor: StageActor,
  stage: { assigned_role: ProcessRoleKey; assigned_user_id: string | null },
  lead?: { assigned_staff?: string | null; created_by?: string | null } | null,
): boolean {
  if (stage.assigned_user_id === actor.id) return true;
  if (!userHasProcessRole(actor.role, stage.assigned_role)) return false;
  if (lead && stage.assigned_role === "SALES_ENGINEER") {
    return canWorkOnLead(actor.role, actor.id, lead);
  }
  return true;
}

export function canManageDefinitions(role: string | null | undefined): boolean {
  return isManagingPartner(role);
}

export function canCancelInstance(
  actor: StageActor,
  instance: { created_by: string | null },
): boolean {
  return isManagingPartner(actor.role) || instance.created_by === actor.id;
}
