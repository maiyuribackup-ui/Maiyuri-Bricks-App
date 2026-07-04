/**
 * Lead taxonomy display metadata — mirrors apps/web/src/lib/lead-taxonomy.ts
 * (kept light: value/label/emoji only). If the web taxonomy changes, update
 * this copy to match.
 */
import type { LeadStatus, LeadTemperature, PipelineStage } from '@maiyuri/shared';

export interface TaxonomyOption<T extends string> {
  value: T;
  label: string;
  emoji: string;
}

export const PIPELINE_STAGES: TaxonomyOption<PipelineStage>[] = [
  { value: 'new_inquiry', label: 'New Inquiry', emoji: '💬' },
  { value: 'qualified_lead', label: 'Qualified Lead', emoji: '✅' },
  { value: 'quote_shared', label: 'Quote Shared', emoji: '📄' },
  { value: 'factory_visit_proof', label: 'Factory Visit / Proof', emoji: '🏭' },
  { value: 'decision_pending', label: 'Decision Pending', emoji: '⏳' },
  { value: 'finalisation', label: 'Finalisation / Closing', emoji: '🤝' },
  { value: 'order_won', label: 'Order Won', emoji: '🎉' },
  { value: 'closed_lost', label: 'Closed Lost', emoji: '❌' },
];

export const LEAD_STATUSES: TaxonomyOption<LeadStatus>[] = [
  { value: 'new_contact_pending', label: 'New - Contact Pending', emoji: '🆕' },
  { value: 'contact_attempted', label: 'Contact Attempted', emoji: '📞' },
  { value: 'connected', label: 'Connected', emoji: '✅' },
  { value: 'follow_up_scheduled', label: 'Follow-Up Scheduled', emoji: '🔁' },
  { value: 'waiting_for_customer', label: 'Waiting for Customer', emoji: '⏳' },
  { value: 'nurture_later', label: 'Nurture Later', emoji: '🌱' },
  { value: 'closed', label: 'Closed', emoji: '🔒' },
];

export const LEAD_TEMPERATURES: TaxonomyOption<LeadTemperature>[] = [
  { value: 'hot', label: 'Hot', emoji: '🔥' },
  { value: 'warm', label: 'Warm', emoji: '🟡' },
  { value: 'cold', label: 'Cold', emoji: '❄️' },
];

/** yyyy-mm-dd for today + offsetDays (matches web LeadQuickActions.isoDate). */
export function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
