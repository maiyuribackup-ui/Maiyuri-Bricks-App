// Lead taxonomy display metadata — value/label/emoji for the categorical
// lead fields, shared by web and mobile so the vocabularies can't drift.
// (The web app additionally styles these with Tailwind classes in
// apps/web/src/lib/lead-taxonomy.ts; colours stay app-side by design.)

import type { LeadStatus, LeadTemperature, PipelineStage } from "./types";

export interface TaxonomyDisplayOption<T extends string> {
  value: T;
  label: string;
  emoji: string;
}

export const PIPELINE_STAGE_OPTIONS: TaxonomyDisplayOption<PipelineStage>[] = [
  { value: "new_inquiry", label: "New Inquiry", emoji: "💬" },
  { value: "qualified_lead", label: "Qualified Lead", emoji: "✅" },
  { value: "quote_shared", label: "Quote Shared", emoji: "📄" },
  { value: "factory_visit_proof", label: "Factory Visit / Proof", emoji: "🏭" },
  { value: "decision_pending", label: "Decision Pending", emoji: "⏳" },
  { value: "finalisation", label: "Finalisation / Closing", emoji: "🤝" },
  { value: "order_won", label: "Order Won", emoji: "🎉" },
  { value: "closed_lost", label: "Closed Lost", emoji: "❌" },
];

export const LEAD_STATUS_OPTIONS: TaxonomyDisplayOption<LeadStatus>[] = [
  { value: "new_contact_pending", label: "New - Contact Pending", emoji: "🆕" },
  { value: "contact_attempted", label: "Contact Attempted", emoji: "📞" },
  { value: "connected", label: "Connected", emoji: "✅" },
  { value: "follow_up_scheduled", label: "Follow-Up Scheduled", emoji: "🔁" },
  { value: "waiting_for_customer", label: "Waiting for Customer", emoji: "⏳" },
  { value: "nurture_later", label: "Nurture Later", emoji: "🌱" },
  { value: "closed", label: "Closed", emoji: "🔒" },
];

export const LEAD_TEMPERATURE_OPTIONS: TaxonomyDisplayOption<LeadTemperature>[] = [
  { value: "hot", label: "Hot", emoji: "🔥" },
  { value: "warm", label: "Warm", emoji: "🟡" },
  { value: "cold", label: "Cold", emoji: "❄️" },
];
