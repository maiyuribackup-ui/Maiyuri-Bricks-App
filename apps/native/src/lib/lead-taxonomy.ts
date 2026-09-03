/**
 * Lead taxonomy display metadata — re-exported from @maiyuri/shared (the
 * single source of truth shared with the web app) under the local names the
 * native screens use.
 */
export type { TaxonomyDisplayOption as TaxonomyOption } from '@maiyuri/shared';
export {
  LEAD_STATUS_OPTIONS as LEAD_STATUSES,
  LEAD_TEMPERATURE_OPTIONS as LEAD_TEMPERATURES,
  PIPELINE_STAGE_OPTIONS as PIPELINE_STAGES,
} from '@maiyuri/shared';

/** yyyy-mm-dd for today + offsetDays (matches web LeadQuickActions.isoDate). */
export function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
