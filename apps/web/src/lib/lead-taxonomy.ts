/**
 * Lead taxonomy (V2) — single source of truth for the display metadata of the
 * five lead categorical fields. Replaces the scattered statusConfig/stageConfig
 * objects that used to live in individual page files.
 *
 *   pipeline_stage    — sales conversion journey (8)
 *   lead_status       — current action state (7)
 *   lead_temperature  — priority (3)
 *   factory_visit_status — proof-stage funnel (6)
 *   lost_reason_code  — structured lost reason (10)
 *
 * Each option carries a `hint` — a plain-English meaning shown inline in the
 * pickers so a salesperson knows exactly which value to choose.
 */

import type {
  PipelineStage,
  LeadStatus,
  LeadTemperature,
  FactoryVisitStatus,
  LostReasonCode,
} from "@maiyuri/shared";

export interface TaxonomyOption<T extends string> {
  value: T;
  label: string;
  emoji: string;
  /** Tailwind text color class */
  color: string;
  /** Tailwind background tint class (for badges / kanban columns) */
  bg: string;
  /** One-line plain-English meaning, shown inline in pickers */
  hint: string;
}

export const PIPELINE_STAGES: TaxonomyOption<PipelineStage>[] = [
  { value: "new_inquiry", label: "New Inquiry", emoji: "💬", color: "text-blue-700", bg: "bg-blue-50", hint: "Lead came in, basic interest shown." },
  { value: "qualified_lead", label: "Qualified Lead", emoji: "✅", color: "text-cyan-700", bg: "bg-cyan-50", hint: "Genuine requirement identified: location, project type, product, timeline." },
  { value: "quote_shared", label: "Quote Shared", emoji: "📄", color: "text-indigo-700", bg: "bg-indigo-50", hint: "Price / estimate has been shared with the customer." },
  { value: "factory_visit_proof", label: "Factory Visit / Proof", emoji: "🏭", color: "text-amber-700", bg: "bg-amber-50", hint: "Customer needs proof: factory visit, sample, lab report, wall photos." },
  { value: "decision_pending", label: "Decision Pending", emoji: "⏳", color: "text-orange-700", bg: "bg-orange-50", hint: "Has enough info but is thinking, comparing, or discussing with family / engineer." },
  { value: "finalisation", label: "Finalisation / Closing", emoji: "🤝", color: "text-purple-700", bg: "bg-purple-50", hint: "Discussing quantity, final price, delivery, advance, schedule." },
  { value: "order_won", label: "Order Won", emoji: "🎉", color: "text-emerald-700", bg: "bg-emerald-50", hint: "Advance received or order confirmed." },
  { value: "closed_lost", label: "Closed Lost", emoji: "❌", color: "text-stone-600", bg: "bg-stone-100", hint: "Customer is not proceeding." },
];

export const LEAD_STATUSES: TaxonomyOption<LeadStatus>[] = [
  { value: "new_contact_pending", label: "New - Contact Pending", emoji: "🆕", color: "text-green-700", bg: "bg-green-50", hint: "Lead received, not yet properly contacted." },
  { value: "contact_attempted", label: "Contact Attempted", emoji: "📞", color: "text-lime-700", bg: "bg-lime-50", hint: "Called / messaged, but no proper conversation yet." },
  { value: "connected", label: "Connected", emoji: "✅", color: "text-teal-700", bg: "bg-teal-50", hint: "Spoke to the customer and understood the basic requirement." },
  { value: "follow_up_scheduled", label: "Follow-Up Scheduled", emoji: "🔁", color: "text-yellow-700", bg: "bg-yellow-50", hint: "A next follow-up date / time is planned." },
  { value: "waiting_for_customer", label: "Waiting for Customer", emoji: "⏳", color: "text-orange-700", bg: "bg-orange-50", hint: "Waiting for plan, quantity, approval, decision or engineer input." },
  { value: "nurture_later", label: "Nurture Later", emoji: "🌱", color: "text-sky-700", bg: "bg-sky-50", hint: "Genuine lead but not immediate; future construction." },
  { value: "closed", label: "Closed", emoji: "🔒", color: "text-stone-600", bg: "bg-stone-100", hint: "Won or lost — no active sales follow-up." },
];

export const LEAD_TEMPERATURES: TaxonomyOption<LeadTemperature>[] = [
  { value: "hot", label: "Hot", emoji: "🔥", color: "text-red-600", bg: "bg-red-50", hint: "Likely to buy soon; active requirement. Follow up within 24 hours." },
  { value: "warm", label: "Warm", emoji: "🟡", color: "text-amber-600", bg: "bg-amber-50", hint: "Genuine lead but not immediate. Follow up within 3–7 days." },
  { value: "cold", label: "Cold", emoji: "❄️", color: "text-blue-600", bg: "bg-blue-50", hint: "Casual enquiry, weak response, unclear need. Nurture occasionally." },
];

export const FACTORY_VISIT_STATUSES: TaxonomyOption<FactoryVisitStatus>[] = [
  { value: "not_discussed", label: "Not Discussed", emoji: "—", color: "text-stone-500", bg: "bg-stone-50", hint: "A factory visit has not been discussed yet." },
  { value: "invited", label: "Invited", emoji: "✉️", color: "text-blue-600", bg: "bg-blue-50", hint: "You invited them to the factory." },
  { value: "scheduled", label: "Scheduled", emoji: "📅", color: "text-amber-600", bg: "bg-amber-50", hint: "A visit date / time is fixed." },
  { value: "visited", label: "Visited", emoji: "🏭", color: "text-emerald-600", bg: "bg-emerald-50", hint: "The customer visited the factory." },
  { value: "no_show", label: "No Show", emoji: "🚫", color: "text-red-600", bg: "bg-red-50", hint: "A visit was scheduled but the customer did not come." },
  { value: "not_required", label: "Not Required", emoji: "➖", color: "text-stone-500", bg: "bg-stone-50", hint: "The customer does not need a visit." },
];

export const LOST_REASON_CODES: TaxonomyOption<LostReasonCode>[] = [
  { value: "price_too_high", label: "Price Too High", emoji: "💰", color: "text-stone-700", bg: "bg-stone-50", hint: "Our price was above the customer's budget / expectation." },
  { value: "chose_kerala_competitor", label: "Chose Kerala Competitor", emoji: "🏷️", color: "text-stone-700", bg: "bg-stone-50", hint: "Went with a cheaper Kerala interlock supplier." },
  { value: "chose_conventional_aac", label: "Chose Conventional / AAC Block", emoji: "🧱", color: "text-stone-700", bg: "bg-stone-50", hint: "Chose red brick / AAC block instead of interlock." },
  { value: "project_delayed", label: "Project Delayed", emoji: "⏸️", color: "text-stone-700", bg: "bg-stone-50", hint: "Construction postponed indefinitely." },
  { value: "customer_not_reachable", label: "Customer Not Reachable", emoji: "📵", color: "text-stone-700", bg: "bg-stone-50", hint: "Repeated attempts, no response." },
  { value: "no_genuine_requirement", label: "No Genuine Requirement", emoji: "🚧", color: "text-stone-700", bg: "bg-stone-50", hint: "Casual enquiry with no real construction need." },
  { value: "transport_delivery_cost", label: "Transport / Delivery Cost", emoji: "🚚", color: "text-stone-700", bg: "bg-stone-50", hint: "Delivery distance / cost killed the deal." },
  { value: "engineer_mason_not_convinced", label: "Engineer / Mason Not Convinced", emoji: "👷", color: "text-stone-700", bg: "bg-stone-50", hint: "The site engineer or mason advised against interlock." },
  { value: "family_decision_delayed", label: "Family Decision Pending", emoji: "👨‍👩‍👧", color: "text-stone-700", bg: "bg-stone-50", hint: "Family could not agree in time." },
  { value: "other", label: "Other", emoji: "📝", color: "text-stone-700", bg: "bg-stone-50", hint: "Reason not covered above — add a note." },
];

// ---------------------------------------------------------------------------
// Field-level guidance (shown via the ℹ️ tooltip next to each field heading)
// ---------------------------------------------------------------------------
export const FIELD_GUIDANCE = {
  pipeline_stage:
    "Where the lead is in the SALES JOURNEY. Move it forward only when the customer actually reaches that step — don't jump ahead because a lead feels promising.",
  lead_status:
    "What is happening RIGHT NOW — your next action state. Keep this current so follow-ups never slip.",
  lead_temperature:
    "Priority, kept separate from stage. 🔥 Hot if at least 3 are true: construction is active or starts within 30 days · quantity or house size is known · a quote is requested/shared · a factory visit is done or scheduled · discussing delivery, price or advance.",
  factory_visit_status:
    "Tracks the proof-building funnel so we can measure visit attendance and visit-to-order conversion.",
  lost_reason_code:
    "Why we lost the lead — pick the closest reason so we can learn and improve. Required when moving to Closed Lost.",
} as const;

// Lookup maps (value -> option) for O(1) display rendering.
function toMap<T extends string>(opts: TaxonomyOption<T>[]): Record<T, TaxonomyOption<T>> {
  return Object.fromEntries(opts.map((o) => [o.value, o])) as Record<T, TaxonomyOption<T>>;
}

export const PIPELINE_STAGE_MAP = toMap(PIPELINE_STAGES);
export const LEAD_STATUS_MAP = toMap(LEAD_STATUSES);
export const LEAD_TEMPERATURE_MAP = toMap(LEAD_TEMPERATURES);
export const FACTORY_VISIT_STATUS_MAP = toMap(FACTORY_VISIT_STATUSES);
export const LOST_REASON_CODE_MAP = toMap(LOST_REASON_CODES);
