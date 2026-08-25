import type { UserRole } from "@maiyuri/shared";

/**
 * Who may work on any lead's commercial side, not just their own.
 *
 * The rest of the app already assumes this: GET /api/leads returns every lead
 * to any signed-in user, and the leads list, quotes list and dashboards are
 * open to all staff. Only quote generation and quote pricing were gated to
 * "founder, or the person the lead is assigned to" — so a salesperson could
 * open a colleague's lead, read it, and then be refused when setting the rate.
 * That was an inconsistency rather than a policy.
 *
 *   founder / owner — run the business
 *   sales           — the sales function is theirs by definition
 *   engineer        — the rate on a quotation IS the engineer's rate; the
 *                     readiness gate refuses to share a quote without it, so
 *                     an engineer who cannot price any lead cannot do the job
 *
 * Deliberately excluded: accountant, driver, production_supervisor. They keep
 * the previous rule and reach only leads assigned to or created by them.
 */
export const FULL_SALES_ACCESS_ROLES: ReadonlySet<string> = new Set<UserRole>([
  "founder",
  "owner",
  "sales",
  "engineer",
]);

/** True when this role may act on every lead's quote, not just its own. */
export function hasFullSalesAccess(role: string | null | undefined): boolean {
  return !!role && FULL_SALES_ACCESS_ROLES.has(role);
}

/**
 * May this user act on this lead's quote?
 *
 * Roles without blanket access fall back to the original ownership rule.
 */
export function canWorkOnLead(
  role: string | null | undefined,
  userId: string | null | undefined,
  lead: { assigned_staff?: string | null; created_by?: string | null } | null,
): boolean {
  if (hasFullSalesAccess(role)) return true;
  if (!userId || !lead) return false;
  return lead.assigned_staff === userId || lead.created_by === userId;
}
