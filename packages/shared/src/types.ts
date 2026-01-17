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

export type UserRole = "founder" | "accountant" | "engineer";

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
