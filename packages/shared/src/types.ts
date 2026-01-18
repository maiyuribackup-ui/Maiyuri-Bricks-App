// Lead Management Types

export type LeadStatus =
  | "new"
  | "follow_up"
  | "hot"
  | "cold"
  | "converted"
  | "lost";

// Lead Classification Types
export type LeadClassification =
  | "direct_customer"
  | "vendor"
  | "builder"
  | "dealer"
  | "architect";

// Requirement Type for construction projects
export type RequirementType =
  | "residential_house"
  | "commercial_building"
  | "eco_friendly_building"
  | "compound_wall";

// Lead Stage - Sales pipeline progression (Issue #19)
export type LeadStage =
  | "inquiry" // Initial inquiry received
  | "quote_sent" // Quote/proposal sent
  | "factory_visit" // Factory visit scheduled or done
  | "negotiation" // In active negotiation
  | "order_confirmed" // Order confirmed by customer
  | "in_production" // Order in production
  | "ready_dispatch" // Ready for dispatch
  | "delivered"; // Delivered to customer

export type UserRole =
  | "founder"
  | "accountant"
  | "engineer"
  | "production_supervisor"
  | "owner";

// Lead Intelligence Types - for decision cockpit
export type LeadUrgency = "immediate" | "1-3_months" | "3-6_months" | "unknown";
export type ConversionLever =
  | "proof"
  | "price"
  | "visit"
  | "relationship"
  | "timeline";

export type LanguagePreference = "en" | "ta";

export interface AIFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
}

export interface AISuggestionItem {
  type: string;
  content: string;
  priority: "high" | "medium" | "low";
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  source: string;
  lead_type: string;
  assigned_staff: string | null;
  status: LeadStatus;
  // Sales pipeline stage (Issue #19) - distinct from status
  stage?: LeadStage | null;
  stage_updated_at?: string | null;
  stage_updated_by?: string | null;
  // Classification and requirement fields
  classification?: LeadClassification | null;
  requirement_type?: RequirementType | null;
  site_region?: string | null;
  site_location?: string | null;
  staff_notes?: string | null;
  ai_summary?: string | null;
  ai_score?: number | null;
  ai_factors?: AIFactor[] | null;
  ai_suggestions?: AISuggestionItem[] | null;
  // Lead Intelligence - consolidated from call recordings
  urgency?: LeadUrgency | null;
  dominant_objection?: string | null;
  best_conversion_lever?: ConversionLever | null;
  lost_reason?: string | null;
  next_action?: string | null;
  follow_up_date?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  // Odoo CRM integration fields
  odoo_lead_id?: number | null;
  odoo_partner_id?: number | null;
  odoo_quote_id?: number | null;
  odoo_order_id?: number | null;
  odoo_quote_number?: string | null;
  odoo_order_number?: string | null;
  odoo_quote_amount?: number | null;
  odoo_order_amount?: number | null;
  odoo_quote_date?: string | null;
  odoo_order_date?: string | null;
  odoo_synced_at?: string | null;
  odoo_sync_status?: "pending" | "synced" | "error" | "not_synced" | null;
  // SmartQuote AI Payload - personalization data for Smart Quote generation
  smart_quote_payload?: SmartQuotePayload | null;
}

// Archive Configuration Types
export interface ArchiveThreshold {
  days: number;
  enabled: boolean;
}

export interface ArchiveConfig {
  converted_days: ArchiveThreshold;
  lost_days: ArchiveThreshold;
  cold_inactivity_days: ArchiveThreshold;
}

export type ArchiveSuggestionStatus = "pending" | "accepted" | "dismissed";

export interface ArchiveSuggestion {
  id: string;
  lead_id: string;
  suggestion_reason: string;
  suggested_at: string;
  ai_confidence: number | null;
  status: ArchiveSuggestionStatus;
  processed_at?: string | null;
  processed_by?: string | null;
  lead?: Lead;
}

export type ArchiveCriteriaType = "converted" | "lost" | "cold_inactive";

export interface ArchiveCriteria {
  type: ArchiveCriteriaType;
  days: number;
  count: number;
}

export interface ArchiveSuggestionsResponse {
  suggestions: ArchiveSuggestion[];
  criteria: ArchiveCriteria[];
  total_candidates: number;
  generated_at: string;
}

export interface Note {
  id: string;
  lead_id: string;
  staff_id: string | null;
  text: string;
  audio_url?: string | null;
  transcription_text?: string | null;
  date: string;
  ai_summary?: string | null;
  confidence_score?: number | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  language_preference: LanguagePreference;
  created_at: string;
}

export interface KnowledgebaseEntry {
  id: string;
  question_text: string;
  answer_text: string;
  embeddings?: number[];
  confidence_score: number;
  source_lead_id?: string | null;
  created_by?: string | null;
  last_updated: string;
  created_at: string;
}

// Dashboard stats
export interface LeadStats {
  status: LeadStatus;
  count: number;
  due_today: number;
  overdue: number;
}

// AI Agent types
export interface AISummary {
  summary: string;
  highlights: string[];
  action_items: string[];
}

export interface AIScore {
  score: number;
  confidence: number;
  factors: { factor: string; impact: "positive" | "negative" | "neutral" }[];
}

export interface AISuggestion {
  id: string;
  type: "action" | "response" | "insight";
  content: string;
  priority: "high" | "medium" | "low";
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  assigned_to?: string; // User ID
  created_by?: string; // Auth User ID
  lead_id?: string;
  created_at: string;
  updated_at: string;
  assignee?: User; // Joined fields
}

// Price Estimator Types
export type ProductCategory = "cement_interlock" | "mud_interlock" | "project";
export type ProductSize = "6_inch" | "8_inch" | null;
export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  size: ProductSize;
  unit: string;
  base_price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FactorySettings {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  transport_rate_per_km: number;
  min_transport_charge: number;
  updated_at: string;
  updated_by?: string | null;
}

export interface EstimateItem {
  id: string;
  estimate_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  sort_order: number;
  created_at?: string;
  product?: Product;
}

export interface Estimate {
  id: string;
  lead_id: string;
  estimate_number: string;
  status: EstimateStatus;
  delivery_address: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  distance_km: number | null;
  subtotal: number;
  transport_cost: number;
  discount_percentage: number;
  discount_amount: number;
  discount_reason: string | null;
  total_amount: number;
  ai_suggested_discount: number | null;
  ai_discount_reasoning: string | null;
  ai_confidence: number | null;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: EstimateItem[];
  lead?: Lead;
}

export interface DiscountFactor {
  name: string;
  impact: "increase" | "decrease" | "neutral";
  weight: number;
  description: string;
}

export interface DiscountSuggestion {
  suggestedPercentage: number;
  maxRecommended: number;
  minAcceptable: number;
  confidence: number;
  reasoning: string;
  factors: DiscountFactor[];
  urgencyLevel: "high" | "medium" | "low";
  competitiveNote?: string;
}

export interface DistanceCalculation {
  distanceKm: number;
  durationMinutes: number;
  transportCost: number;
}

// Call Recording Types (Telegram Audio Ingestion)
export type CallRecordingStatus =
  | "pending"
  | "downloading"
  | "converting"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

// Call Recording Structured Types for Decision Cockpit
export type CallIntent =
  | "price_enquiry"
  | "technical_validation"
  | "site_visit"
  | "comparison"
  | "research"
  | "complaint"
  | "order_follow_up";
export type BuyerRole =
  | "owner"
  | "engineer"
  | "contractor"
  | "influencer"
  | "unknown";
export type UrgencySignal =
  | "immediate"
  | "1-3_months"
  | "3-6_months"
  | "unknown";

export interface CallRecordingInsights {
  complaints?: string[];
  negative_feedback?: string[];
  negotiation_signals?: string[];
  price_expectations?: string[];
  positive_signals?: string[];
  recommended_actions?: string[];
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
  // Structured fields for decision cockpit
  primary_intent?: CallIntent;
  buyer_role?: BuyerRole;
  urgency_signal?: UrgencySignal;
  key_objection?: string;
  budget_range?: string;
}

export interface CallRecording {
  id: string;
  lead_id: string | null;
  phone_number: string;

  // Telegram metadata
  telegram_file_id: string;
  telegram_message_id: number;
  telegram_chat_id: number;
  telegram_user_id: number | null;
  original_filename: string;

  // Google Drive storage
  mp3_gdrive_file_id: string | null;
  mp3_gdrive_url: string | null;

  // Transcription data
  transcription_text: string | null;
  transcription_language: string | null;
  transcription_confidence: number | null;

  // AI Analysis results
  ai_summary: string | null;
  ai_insights: CallRecordingInsights;
  ai_score_impact: number | null;

  // Processing status
  processing_status: CallRecordingStatus;
  error_message: string | null;
  retry_count: number;

  // Audio metadata
  duration_seconds: number | null;
  file_size_bytes: number | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  processed_at: string | null;

  // Duplicate detection
  audio_hash: string | null;

  // Joined fields
  lead?: Lead;
}

// ============================================================================
// Smart Quote Types (AI-Personalized Quotation System)
// ============================================================================

export type SmartQuoteLanguage = "en" | "ta";
export type SmartQuoteStage = "cold" | "warm" | "hot";
export type SmartQuoteRoute =
  | "site_visit"
  | "technical_call"
  | "cost_estimate"
  | "nurture";
export type SmartQuotePageKey =
  | "entry"
  | "climate"
  | "cost"
  | "objection"
  | "cta";
export type SmartQuoteEventType =
  | "view"
  | "scroll"
  | "section_view"
  | "cta_click"
  | "lang_toggle"
  | "form_submit";

export type SmartQuoteObjectionType =
  | "price"
  | "strength"
  | "water"
  | "approval"
  | "maintenance"
  | "resale"
  | "contractor_acceptance";

export type SmartQuoteObjectionSeverity = "low" | "medium" | "high";

export interface SmartQuoteScores {
  interest: number;
  urgency: number;
  price_sensitivity: number;
  trust: number;
}

export interface SmartQuoteObjection {
  type: SmartQuoteObjectionType;
  severity: SmartQuoteObjectionSeverity;
}

export interface SmartQuotePageBlock {
  key: SmartQuotePageKey;
  blocks: string[];
}

export interface SmartQuotePageConfig {
  pages: SmartQuotePageBlock[];
}

export interface SmartQuoteCopyMap {
  en: Record<string, string>;
  ta: Record<string, string>;
}

export interface SmartQuote {
  id: string;
  lead_id: string;
  link_slug: string;
  language_default: SmartQuoteLanguage;
  persona: string | null;
  stage: SmartQuoteStage | null;
  primary_angle: string | null;
  secondary_angle: string | null;
  route_decision: SmartQuoteRoute | null;
  top_objections: SmartQuoteObjection[];
  risk_flags: string[];
  scores: SmartQuoteScores;
  page_config: SmartQuotePageConfig;
  copy_map: SmartQuoteCopyMap;
  created_at: string;
  updated_at: string;
  // Joined fields
  lead?: Lead;
}

export type SmartQuoteImageScope = "template" | "lead_override";

export interface SmartQuoteImage {
  id: string;
  smart_quote_id: string | null;
  page_key: SmartQuotePageKey;
  scope: SmartQuoteImageScope;
  image_url: string;
  created_at: string;
}

export interface SmartQuoteEvent {
  id: string;
  smart_quote_id: string;
  event_type: SmartQuoteEventType;
  section_key: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// Smart Quote with resolved images (for customer view)
export interface SmartQuoteWithImages extends SmartQuote {
  images: Record<SmartQuotePageKey, SmartQuoteImage | null>;
}

// Smart Quote CTA form submission
export interface SmartQuoteCtaSubmission {
  name: string;
  phone: string;
  locality?: string;
  preferred_time?: string;
}

// ============================================================================
// SmartQuotePayload Types (AI-Generated for Personalization)
// ============================================================================

export type SmartQuotePersona =
  | "homeowner"
  | "builder"
  | "architect"
  | "unknown";

export type SmartQuoteAngle =
  | "health"
  | "cooling"
  | "cost"
  | "sustainability"
  | "design";

export type CompetitorTone = "curious" | "comparing" | "doubtful" | "none";

export interface SmartQuotePersonalizationSnippets {
  en: { p1: string; p2?: string };
  ta: { p1: string; p2?: string };
}

export interface SmartQuoteCompetitorContext {
  mentioned: boolean;
  tone: CompetitorTone;
}

/**
 * SmartQuotePayload - AI-generated payload for Smart Quote personalization.
 * This is the single source of truth for:
 * - Copy personalization
 * - Section selection
 * - Objection handling
 * - CTA routing
 * - Language default
 */
export interface SmartQuotePayload {
  language_default: SmartQuoteLanguage;
  persona: SmartQuotePersona;
  stage: SmartQuoteStage;
  primary_angle: SmartQuoteAngle;
  secondary_angle: SmartQuoteAngle | null;
  top_objections: SmartQuoteObjection[];
  route_decision: SmartQuoteRoute;
  personalization_snippets: SmartQuotePersonalizationSnippets;
  competitor_context: SmartQuoteCompetitorContext;
}

// ============================================================================
// Production Module Types (Odoo MRP Integration)
// ============================================================================

export type ProductionOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "confirmed"
  | "in_progress"
  | "done"
  | "cancelled"
  | "completed";

export type ProductionSyncStatus =
  | "pending"
  | "synced"
  | "error"
  | "not_synced";

export type ProductionShiftStatus = "in_progress" | "completed";

export type ProductionSyncType =
  | "product_sync"
  | "bom_sync"
  | "employee_sync"
  | "mo_create"
  | "mo_update"
  | "mo_confirm"
  | "mo_done"
  | "attendance_sync";

// Finished Goods (synced from Odoo product.product)
export interface FinishedGood {
  id: string;
  odoo_product_id: number;
  name: string;
  internal_reference: string | null;
  category: string;
  uom_id: number | null;
  uom_name: string | null;
  bom_id: number | null;
  bom_quantity: number | null;
  is_active: boolean;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

// Raw Materials (synced from Odoo BOM lines)
export interface RawMaterial {
  id: string;
  odoo_product_id: number;
  name: string;
  internal_reference: string | null;
  category: string;
  uom_id: number | null;
  uom_name: string | null;
  is_active: boolean;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

// BOM Lines (linking finished goods to raw materials)
export interface BOMLine {
  id: string;
  finished_good_id: string;
  raw_material_id: string;
  odoo_bom_line_id: number | null;
  quantity_per_bom: number;
  uom_name: string | null;
  sort_order: number;
  created_at: string;
  // Joined
  raw_material?: RawMaterial;
}

// Employees (synced from Odoo hr.employee)
export interface Employee {
  id: string;
  odoo_employee_id: number;
  name: string;
  department: string | null;
  job_title: string | null;
  work_email: string | null;
  is_active: boolean;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

// Production Orders (local + synced to Odoo mrp.production)
export interface ProductionOrder {
  id: string;
  order_number: string;
  finished_good_id: string;
  planned_quantity: number;
  actual_quantity: number | null;
  status: ProductionOrderStatus;
  scheduled_date: string;
  start_date: string | null;
  end_date: string | null;
  odoo_production_id: number | null;
  odoo_sync_status: ProductionSyncStatus;
  odoo_synced_at: string | null;
  odoo_error_message: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  finished_good?: FinishedGood;
  consumption_lines?: ProductionConsumptionLine[];
  shifts?: ProductionShift[];
}

// Production Shifts (multiple per order)
export interface ProductionShift {
  id: string;
  production_order_id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  status: ProductionShiftStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  attendance?: ProductionAttendance[];
}

// Production Attendance (employees per shift)
export interface ProductionAttendance {
  id: string;
  shift_id: string;
  employee_id: string;
  check_in: string;
  check_out: string | null;
  odoo_attendance_id: number | null;
  odoo_sync_status: ProductionSyncStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  employee?: Employee;
}

// Production Consumption Lines (RM usage)
export interface ProductionConsumptionLine {
  id: string;
  production_order_id: string;
  raw_material_id: string;
  expected_quantity: number;
  actual_quantity: number | null;
  uom_name: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  raw_material?: RawMaterial;
  // Computed (client-side)
  difference?: number;
}

// Production Sync Log (audit trail)
export interface ProductionSyncLog {
  id: string;
  production_order_id: string | null;
  sync_type: ProductionSyncType;
  status: "success" | "error";
  odoo_response: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

// Odoo BOM types (for API responses)
export interface OdooBOM {
  id: number;
  product_id: [number, string] | false;
  product_tmpl_id: [number, string];
  product_qty: number;
  product_uom_id: [number, string];
  bom_line_ids: number[];
}

export interface OdooBOMLine {
  id: number;
  product_id: [number, string];
  product_qty: number;
  product_uom_id: [number, string];
  bom_id: [number, string];
  sequence?: number;
}

export interface OdooEmployee {
  id: number;
  name: string;
  department_id: [number, string] | false;
  job_id: [number, string] | false;
  work_email: string | false;
  active: boolean;
}

export interface OdooProduct {
  id: number;
  name: string;
  default_code: string | false;
  categ_id: [number, string];
  uom_id: [number, string] | false;
}

// Form input types
export interface ConsumptionLineInput {
  raw_material_id: string;
  expected_quantity: number;
  actual_quantity?: number | null;
  uom_name?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface ShiftInput {
  shift_date: string;
  start_time: string;
  end_time?: string | null;
  employee_ids: string[];
  notes?: string | null;
}

export interface CreateProductionOrderInput {
  finished_good_id: string;
  planned_quantity: number;
  scheduled_date: string;
  notes?: string | null;
  consumption_lines: ConsumptionLineInput[];
  shifts?: ShiftInput[];
}

export interface UpdateProductionOrderInput {
  planned_quantity?: number;
  actual_quantity?: number | null;
  status?: ProductionOrderStatus;
  scheduled_date?: string;
  notes?: string | null;
}

export interface UpdateConsumptionLineInput {
  actual_quantity: number;
  notes?: string | null;
}

export interface ProductionOrderFilters {
  status?: ProductionOrderStatus;
  from_date?: string;
  to_date?: string;
  finished_good_id?: string;
  odoo_sync_status?: ProductionSyncStatus;
  search?: string;
}

// BOM response with lines
export interface BOMResponse {
  bom_quantity: number;
  lines: BOMLine[];
}

// Production order with all relations
export interface ProductionOrderWithRelations extends ProductionOrder {
  finished_good: FinishedGood;
  consumption_lines: (ProductionConsumptionLine & {
    raw_material: RawMaterial;
  })[];
  shifts: (ProductionShift & {
    attendance: (ProductionAttendance & { employee: Employee })[];
  })[];
}

// ============================================================================
// Approval Workflow Types (Ticketing System - Issue #25)
// ============================================================================

export type TicketStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "changes_requested";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketType =
  | "production_order"
  | "quote_approval"
  | "payment_approval";

export type TicketHistoryAction =
  | "created"
  | "status_changed"
  | "assigned"
  | "commented"
  | "approved"
  | "rejected"
  | "changes_requested";

export interface Ticket {
  id: string;
  ticket_number: string;
  type: TicketType;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_by: string;
  assigned_to: string | null;
  production_order_id: string | null;
  lead_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  approval_notes: string | null;
  rejection_reason: string | null;
  // Joined fields
  created_by_user?: { id: string; full_name: string; email: string };
  assigned_to_user?: { id: string; full_name: string; email: string };
  resolved_by_user?: { id: string; full_name: string };
  production_order?: ProductionOrder;
  lead?: Lead;
}

export interface TicketHistoryEntry {
  id: string;
  ticket_id: string;
  action: TicketHistoryAction;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  performed_by: string;
  created_at: string;
  // Joined fields
  performed_by_user?: { id: string; full_name: string };
}

// Ticket with full history
export interface TicketWithHistory extends Ticket {
  history: TicketHistoryEntry[];
}

// Ticket filters for API
export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  created_by?: string;
  assigned_to?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
}

// Approval queue stats
export interface ApprovalQueueStats {
  pending: number;
  urgent: number;
  in_review: number;
  approved_today: number;
  total: number;
  my_assigned_count: number;
}

// Create ticket input
export interface CreateTicketInput {
  type: TicketType;
  title: string;
  description?: string | null;
  priority?: TicketPriority;
  production_order_id?: string | null;
  lead_id?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
}

// Approve/Reject inputs
export interface ApproveTicketInput {
  notes?: string;
}

export interface RejectTicketInput {
  reason: string;
}

export interface RequestChangesInput {
  reason: string;
}

// Add comment input
export interface AddTicketCommentInput {
  comment: string;
}

// Extended ProductionOrder with ticket info
export interface ProductionOrderWithTicket extends ProductionOrder {
  ticket_id: string | null;
  submitted_for_approval_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  ticket?: Ticket;
}
