// Zod validation schemas

import { z } from "zod";

export const leadStatusSchema = z.enum([
  "new",
  "follow_up",
  "hot",
  "cold",
  "converted",
  "lost",
]);

// Lead Stage Schema - Sales pipeline progression (Issue #19)
export const leadStageSchema = z.enum([
  "inquiry",
  "quote_sent",
  "factory_visit",
  "negotiation",
  "order_confirmed",
  "in_production",
  "ready_dispatch",
  "delivered",
]);

// Lead Classification Schema
export const leadClassificationSchema = z.enum([
  "direct_customer",
  "vendor",
  "builder",
  "dealer",
  "architect",
]);

// Requirement Type Schema
export const requirementTypeSchema = z.enum([
  "residential_house",
  "commercial_building",
  "eco_friendly_building",
  "compound_wall",
]);

// Product Interest Schema (multi-select)
export const productInterestSchema = z.enum([
  "8_inch_mud_interlock",
  "6_inch_mud_interlock",
  "8_inch_cement_interlock",
  "6_inch_cement_interlock",
  "compound_wall_project",
  "residential_project",
  "laying_services",
]);

// Helper to coerce empty strings to null (for optional select fields)
const emptyStringToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" ? null : val), schema);

// Optional classification that accepts empty string from form selects
export const optionalClassificationSchema = emptyStringToNull(
  leadClassificationSchema.nullable().optional(),
);

// Optional requirement type that accepts empty string from form selects
export const optionalRequirementTypeSchema = emptyStringToNull(
  requirementTypeSchema.nullable().optional(),
);

// Optional lead stage that accepts empty string from form selects (Issue #19)
export const optionalLeadStageSchema = emptyStringToNull(
  leadStageSchema.nullable().optional(),
);

export const userRoleSchema = z.enum([
  "founder",
  "accountant",
  "engineer",
  "production_supervisor",
  "owner",
]);

export const createLeadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().min(10, "Valid contact number required"),
  source: z.string().min(1, "Source is required"),
  lead_type: z.string().min(1, "Lead type is required"),
  assigned_staff: z.string().uuid("Invalid staff ID").nullable().optional(),
  status: leadStatusSchema.default("new"),
  // Sales pipeline stage (Issue #19)
  stage: optionalLeadStageSchema,
  // New classification and location fields (coerce empty string to null)
  classification: optionalClassificationSchema,
  requirement_type: optionalRequirementTypeSchema,
  // Product interests (multi-select)
  product_interests: z.array(productInterestSchema).default([]).optional(),
  site_region: emptyStringToNull(z.string().nullable().optional()),
  site_location: emptyStringToNull(z.string().nullable().optional()),
  next_action: emptyStringToNull(z.string().nullable().optional()),
  follow_up_date: emptyStringToNull(z.string().nullable().optional()),
  is_archived: z.boolean().default(false).optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  contact: z.string().min(10).optional(),
  source: z.string().min(1).optional(),
  lead_type: z.string().min(1).optional(),
  assigned_staff: emptyStringToNull(z.string().uuid().nullable().optional()),
  status: leadStatusSchema.optional(),
  // Sales pipeline stage (Issue #19)
  stage: optionalLeadStageSchema,
  stage_updated_at: emptyStringToNull(z.string().nullable().optional()),
  stage_updated_by: emptyStringToNull(z.string().nullable().optional()),
  // New classification and location fields (coerce empty string to null)
  classification: optionalClassificationSchema,
  requirement_type: optionalRequirementTypeSchema,
  // Product interests (multi-select)
  product_interests: z.array(productInterestSchema).optional(),
  site_region: emptyStringToNull(z.string().nullable().optional()),
  site_location: emptyStringToNull(z.string().nullable().optional()),
  next_action: emptyStringToNull(z.string().nullable().optional()),
  follow_up_date: emptyStringToNull(z.string().nullable().optional()),
  is_archived: z.boolean().optional(),
  archived_at: emptyStringToNull(z.string().nullable().optional()),
  archived_by: emptyStringToNull(z.string().uuid().nullable().optional()),
  archive_reason: emptyStringToNull(z.string().nullable().optional()),
});

export const createNoteSchema = z.object({
  lead_id: z.string().uuid("Invalid lead ID"),
  text: z.string().min(1, "Note text is required"),
  audio_url: z.string().url().optional(),
});

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

// Update lead stage (Issue #19)
export const updateLeadStageSchema = z.object({
  stage: leadStageSchema,
});

export const updateNoteSchema = z.object({
  text: z.string().min(1).optional(),
  audio_url: z.string().url().nullable().optional(),
  transcription_text: z.string().nullable().optional(),
  ai_summary: z.string().nullable().optional(),
});

export const createKnowledgebaseSchema = z.object({
  question_text: z.string().min(1, "Question is required"),
  answer_text: z.string().min(1, "Answer is required"),
  confidence_score: z.number().min(0).max(1).default(0.5),
  source_lead_id: z.string().uuid().nullable().optional(),
});

// Query params schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const leadFiltersSchema = z.object({
  status: leadStatusSchema.optional(),
  stage: leadStageSchema.optional(), // Issue #19
  assigned_staff: z.string().uuid().optional(),
  search: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  is_archived: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_date: z.string().optional(), // ISO string
  assigned_to: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().uuid(),
});

export const taskFiltersSchema = z.object({
  status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigned_to: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
});

// Archive schemas
export const archiveThresholdSchema = z.object({
  days: z.number().int().min(1).max(365),
  enabled: z.boolean(),
});

export const archiveConfigSchema = z.object({
  converted_days: archiveThresholdSchema,
  lost_days: archiveThresholdSchema,
  cold_inactivity_days: archiveThresholdSchema,
});

export const updateArchiveConfigSchema = archiveConfigSchema.partial();

export const batchArchiveSchema = z.object({
  lead_ids: z
    .array(z.string().uuid())
    .min(1, "At least one lead required")
    .max(100, "Maximum 100 leads"),
  reason: z.string().optional(),
});

export const batchRestoreSchema = z.object({
  lead_ids: z
    .array(z.string().uuid())
    .min(1, "At least one lead required")
    .max(100, "Maximum 100 leads"),
});

export const archiveSuggestionActionSchema = z.object({
  suggestion_ids: z
    .array(z.string().uuid())
    .min(1, "At least one suggestion required"),
  action: z.enum(["accept", "dismiss"]),
});

// Export types
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type UpdateLeadStageInput = z.infer<typeof updateLeadStageSchema>;
export type CreateKnowledgebaseInput = z.infer<
  typeof createKnowledgebaseSchema
>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type LeadFiltersInput = z.infer<typeof leadFiltersSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFiltersInput = z.infer<typeof taskFiltersSchema>;
export type ArchiveConfigInput = z.infer<typeof archiveConfigSchema>;
export type UpdateArchiveConfigInput = z.infer<
  typeof updateArchiveConfigSchema
>;
export type BatchArchiveInput = z.infer<typeof batchArchiveSchema>;
export type BatchRestoreInput = z.infer<typeof batchRestoreSchema>;
export type ArchiveSuggestionActionInput = z.infer<
  typeof archiveSuggestionActionSchema
>;

// Price Estimator Schemas
export const productCategorySchema = z.enum([
  "cement_interlock",
  "mud_interlock",
  "project",
]);
export const productSizeSchema = z.enum(["6_inch", "8_inch"]).nullable();
export const estimateStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
]);

export const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  category: productCategorySchema,
  size: productSizeSchema.optional(),
  unit: z.string().min(1, "Unit is required"),
  base_price: z.number().positive("Price must be positive"),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

export const factorySettingsSchema = z.object({
  name: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90, "Invalid latitude"),
  longitude: z.number().min(-180).max(180, "Invalid longitude"),
  address: z.string().nullable().optional(),
  transport_rate_per_km: z.number().positive("Rate must be positive"),
  min_transport_charge: z.number().min(0, "Minimum charge cannot be negative"),
});

export const updateFactorySettingsSchema = factorySettingsSchema.partial();

export const estimateItemSchema = z.object({
  product_id: z.string().uuid("Invalid product ID"),
  quantity: z.number().positive("Quantity must be positive"),
  unit_price: z.number().positive().optional(), // Uses product base_price if not provided
  notes: z.string().nullable().optional(),
});

export const createEstimateSchema = z.object({
  delivery_address: z.string().min(5, "Delivery address is required"),
  delivery_latitude: z.number().min(-90).max(90).optional(),
  delivery_longitude: z.number().min(-180).max(180).optional(),
  distance_km: z.number().min(0).optional(),
  items: z.array(estimateItemSchema).min(1, "At least one item is required"),
  discount_percentage: z
    .number()
    .min(0)
    .max(50, "Maximum 50% discount allowed")
    .optional(),
  discount_reason: z.string().nullable().optional(),
  valid_until: z.string().optional(),
  notes: z.string().nullable().optional(),
  // AI suggestion data (optional - saved when AI suggestion is applied)
  ai_suggested_discount: z.number().min(0).max(50).optional(),
  ai_discount_reasoning: z.string().nullable().optional(),
  ai_confidence: z.number().min(0).max(1).optional(),
});

export const updateEstimateSchema = createEstimateSchema.partial().extend({
  status: estimateStatusSchema.optional(),
});

export const calculateDistanceSchema = z.object({
  destination_address: z.string().min(5).optional(),
  destination_latitude: z.number().min(-90).max(90),
  destination_longitude: z.number().min(-180).max(180),
});

export const discountSuggestionRequestSchema = z.object({
  lead_id: z.string().uuid(),
  subtotal: z.number().positive(),
  items_count: z.number().int().positive(),
  distance_km: z.number().min(0).optional(),
});

// Export Price Estimator types
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type FactorySettingsInput = z.infer<typeof factorySettingsSchema>;
export type UpdateFactorySettingsInput = z.infer<
  typeof updateFactorySettingsSchema
>;
export type EstimateItemInput = z.infer<typeof estimateItemSchema>;
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>;
export type CalculateDistanceInput = z.infer<typeof calculateDistanceSchema>;
export type DiscountSuggestionRequestInput = z.infer<
  typeof discountSuggestionRequestSchema
>;

// Call Recording Schemas (Telegram Audio Ingestion)
export const callRecordingStatusSchema = z.enum([
  "pending",
  "downloading",
  "converting",
  "uploading",
  "transcribing",
  "analyzing",
  "completed",
  "failed",
]);

export const callRecordingInsightsSchema = z.object({
  complaints: z.array(z.string()).optional(),
  negative_feedback: z.array(z.string()).optional(),
  negotiation_signals: z.array(z.string()).optional(),
  price_expectations: z.array(z.string()).optional(),
  positive_signals: z.array(z.string()).optional(),
  recommended_actions: z.array(z.string()).optional(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]).optional(),
});

// Schema for creating a new call recording (from Telegram webhook)
export const createCallRecordingSchema = z.object({
  phone_number: z.string().min(10, "Valid phone number required"),
  telegram_file_id: z.string().min(1, "Telegram file ID is required"),
  telegram_message_id: z.number().int().positive(),
  telegram_chat_id: z.number().int(),
  telegram_user_id: z.number().int().nullable().optional(),
  original_filename: z.string().min(1, "Filename is required"),
  lead_id: z.string().uuid().nullable().optional(),
  file_size_bytes: z.number().int().positive().optional(),
  audio_hash: z.string().nullable().optional(),
});

// Schema for updating a call recording (from worker processing)
export const updateCallRecordingSchema = z.object({
  processing_status: callRecordingStatusSchema.optional(),
  error_message: z.string().nullable().optional(),
  retry_count: z.number().int().min(0).optional(),
  mp3_gdrive_file_id: z.string().nullable().optional(),
  mp3_gdrive_url: z.string().url().nullable().optional(),
  transcription_text: z.string().nullable().optional(),
  transcription_language: z.string().nullable().optional(),
  transcription_confidence: z.number().min(0).max(1).nullable().optional(),
  ai_summary: z.string().nullable().optional(),
  ai_insights: callRecordingInsightsSchema.optional(),
  ai_score_impact: z.number().min(-1).max(1).nullable().optional(),
  duration_seconds: z.number().int().positive().nullable().optional(),
  processed_at: z.string().nullable().optional(),
});

// Schema for admin filtering call recordings
export const callRecordingFiltersSchema = z.object({
  processing_status: callRecordingStatusSchema.optional(),
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

// Export Call Recording types
export type CreateCallRecordingInput = z.infer<
  typeof createCallRecordingSchema
>;
export type UpdateCallRecordingInput = z.infer<
  typeof updateCallRecordingSchema
>;
export type CallRecordingFiltersInput = z.infer<
  typeof callRecordingFiltersSchema
>;
export type CallRecordingInsightsInput = z.infer<
  typeof callRecordingInsightsSchema
>;

// ============================================================================
// Smart Quote Schemas (AI-Personalized Quotation System)
// ============================================================================

export const smartQuoteLanguageSchema = z.enum(["en", "ta"]);
export const smartQuoteStageSchema = z.enum(["cold", "warm", "hot"]);
export const smartQuoteRouteSchema = z.enum([
  "site_visit",
  "technical_call",
  "cost_estimate",
  "nurture",
]);
export const smartQuotePageKeySchema = z.enum([
  "entry",
  "climate",
  "cost",
  "objection",
  "cta",
]);
export const smartQuoteEventTypeSchema = z.enum([
  "view",
  "scroll",
  "section_view",
  "cta_click",
  "lang_toggle",
  "form_submit",
]);
export const smartQuoteObjectionTypeSchema = z.enum([
  "price",
  "strength",
  "water",
  "approval",
  "maintenance",
  "resale",
]);
export const smartQuoteObjectionSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
]);
export const smartQuoteImageScopeSchema = z.enum(["template", "lead_override"]);

// Objection object schema
export const smartQuoteObjectionSchema = z.object({
  type: smartQuoteObjectionTypeSchema,
  severity: smartQuoteObjectionSeveritySchema,
});

// Scores schema
export const smartQuoteScoresSchema = z.object({
  interest: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  price_sensitivity: z.number().min(0).max(1),
  trust: z.number().min(0).max(1),
});

// Page block config schema
export const smartQuotePageBlockSchema = z.object({
  key: smartQuotePageKeySchema,
  blocks: z.array(z.string()),
});

export const smartQuotePageConfigSchema = z.object({
  pages: z.array(smartQuotePageBlockSchema),
});

// Copy map schema (bilingual content)
export const smartQuoteCopyMapSchema = z.object({
  en: z.record(z.string()),
  ta: z.record(z.string()),
});

// Generate Smart Quote request (from admin)
export const generateSmartQuoteSchema = z.object({
  lead_id: z.string().uuid("Invalid lead ID"),
  regenerate: z.boolean().default(false),
});

// Smart Quote event tracking (from customer page)
export const smartQuoteEventSchema = z.object({
  event_type: smartQuoteEventTypeSchema,
  section_key: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

// CTA form submission (from customer)
export const smartQuoteCtaSubmitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(10, "Valid phone number required"),
  locality: z.string().optional(),
  preferred_time: z.string().optional(),
});

// Image upload (admin)
export const smartQuoteImageUploadSchema = z.object({
  page_key: smartQuotePageKeySchema,
  scope: smartQuoteImageScopeSchema,
  smart_quote_id: z.string().uuid().nullable().optional(),
});

// Full Smart Quote schema (for validation of AI output)
export const smartQuoteAIOutputSchema = z.object({
  language_default: smartQuoteLanguageSchema,
  persona: z.string().nullable(),
  stage: smartQuoteStageSchema.nullable(),
  primary_angle: z.string().nullable(),
  secondary_angle: z.string().nullable(),
  route_decision: smartQuoteRouteSchema.nullable(),
  top_objections: z.array(smartQuoteObjectionSchema),
  risk_flags: z.array(z.string()),
  scores: smartQuoteScoresSchema,
  page_config: smartQuotePageConfigSchema,
  copy_map: smartQuoteCopyMapSchema,
});

// Export Smart Quote types
export type SmartQuoteLanguageInput = z.infer<typeof smartQuoteLanguageSchema>;
export type SmartQuoteStageInput = z.infer<typeof smartQuoteStageSchema>;
export type SmartQuoteRouteInput = z.infer<typeof smartQuoteRouteSchema>;
export type SmartQuotePageKeyInput = z.infer<typeof smartQuotePageKeySchema>;
export type SmartQuoteEventTypeInput = z.infer<
  typeof smartQuoteEventTypeSchema
>;
export type GenerateSmartQuoteInput = z.infer<typeof generateSmartQuoteSchema>;
export type SmartQuoteEventInput = z.infer<typeof smartQuoteEventSchema>;
export type SmartQuoteCtaSubmitInput = z.infer<
  typeof smartQuoteCtaSubmitSchema
>;
export type SmartQuoteImageUploadInput = z.infer<
  typeof smartQuoteImageUploadSchema
>;
export type SmartQuoteAIOutputInput = z.infer<typeof smartQuoteAIOutputSchema>;

// ============================================================================
// Production Module Schemas (Odoo MRP Integration with Attendance)
// ============================================================================

// Status enums
export const productionOrderStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "confirmed",
  "in_progress",
  "done",
  "cancelled",
  "completed",
]);

export const productionSyncStatusSchema = z.enum([
  "pending",
  "synced",
  "error",
  "not_synced",
]);

export const productionShiftStatusSchema = z.enum(["in_progress", "completed"]);

// Consumption line input (for creating/updating consumption)
export const consumptionLineInputSchema = z.object({
  raw_material_id: z.string().uuid("Invalid raw material ID"),
  expected_quantity: z.number().positive("Expected quantity must be positive"),
  actual_quantity: z.number().min(0).nullable().optional(),
  uom_name: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

// Shift input (for creating shifts with employees)
export const shiftInputSchema = z.object({
  shift_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().nullable().optional(),
  employee_ids: z
    .array(z.string().uuid())
    .min(1, "At least one employee required"),
  notes: z.string().nullable().optional(),
});

// Attendance entry input
export const attendanceEntrySchema = z.object({
  employee_id: z.string().uuid("Invalid employee ID"),
  check_in: z.string().min(1, "Check-in time is required"),
  check_out: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Create production order schema
export const createProductionOrderSchema = z.object({
  finished_good_id: z.string().uuid("Invalid finished good ID"),
  planned_quantity: z.number().positive("Quantity must be positive"),
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  consumption_lines: z
    .array(consumptionLineInputSchema)
    .min(1, "At least one consumption line required"),
  shifts: z.array(shiftInputSchema).optional(),
  notes: z.string().nullable().optional(),
});

// Update production order schema
export const updateProductionOrderSchema = z.object({
  planned_quantity: z.number().positive().optional(),
  actual_quantity: z.number().min(0).nullable().optional(),
  status: productionOrderStatusSchema.optional(),
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Production order filters
export const productionOrderFiltersSchema = z.object({
  status: productionOrderStatusSchema.optional(),
  finished_good_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  odoo_sync_status: productionSyncStatusSchema.optional(),
  search: z.string().optional(),
});

// Create shift schema (for adding shift to existing order)
export const createShiftSchema = z.object({
  production_order_id: z.string().uuid("Invalid production order ID"),
  shift_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  start_time: z.string().min(1, "Start time is required"),
  employee_ids: z
    .array(z.string().uuid())
    .min(1, "At least one employee required"),
  notes: z.string().nullable().optional(),
});

// Update shift schema (primarily for ending shift)
export const updateShiftSchema = z.object({
  end_time: z.string().nullable().optional(),
  status: productionShiftStatusSchema.optional(),
  notes: z.string().nullable().optional(),
});

// Update consumption line (actual quantity entry)
export const updateConsumptionLineSchema = z.object({
  actual_quantity: z.number().min(0, "Quantity cannot be negative"),
  notes: z.string().nullable().optional(),
});

// Sync to Odoo request
export const syncToOdooSchema = z.object({
  include_attendance: z.boolean().default(true),
});

// Employee filter schema
export const employeeFiltersSchema = z.object({
  department: z.string().optional(),
  is_active: z.boolean().optional(),
  search: z.string().optional(),
});

// Export Production Module types
export type ConsumptionLineInputData = z.infer<
  typeof consumptionLineInputSchema
>;
export type ShiftInputData = z.infer<typeof shiftInputSchema>;
export type AttendanceEntryData = z.infer<typeof attendanceEntrySchema>;
export type CreateProductionOrderData = z.infer<
  typeof createProductionOrderSchema
>;
export type UpdateProductionOrderData = z.infer<
  typeof updateProductionOrderSchema
>;
export type ProductionOrderFiltersData = z.infer<
  typeof productionOrderFiltersSchema
>;
export type CreateShiftData = z.infer<typeof createShiftSchema>;
export type UpdateShiftData = z.infer<typeof updateShiftSchema>;
export type UpdateConsumptionLineData = z.infer<
  typeof updateConsumptionLineSchema
>;
export type SyncToOdooData = z.infer<typeof syncToOdooSchema>;
export type EmployeeFiltersData = z.infer<typeof employeeFiltersSchema>;

// ============================================================================
// Approval Workflow Schemas (Ticketing System - Issue #25)
// ============================================================================

// Ticket status enums
export const ticketStatusSchema = z.enum([
  "pending",
  "in_review",
  "approved",
  "rejected",
  "changes_requested",
]);

export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const ticketTypeSchema = z.enum([
  "production_order",
  "quote_approval",
  "payment_approval",
]);

export const ticketHistoryActionSchema = z.enum([
  "created",
  "status_changed",
  "assigned",
  "commented",
  "approved",
  "rejected",
  "changes_requested",
]);

// Create ticket schema
export const createTicketSchema = z.object({
  type: ticketTypeSchema,
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  priority: ticketPrioritySchema.default("medium"),
  production_order_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

// Approve ticket schema
export const approveTicketSchema = z.object({
  notes: z.string().optional(),
});

// Reject ticket schema
export const rejectTicketSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

// Request changes schema
export const requestChangesSchema = z.object({
  reason: z.string().min(1, "Change request reason is required"),
});

// Add comment schema
export const addTicketCommentSchema = z.object({
  comment: z.string().min(1, "Comment is required"),
});

// Ticket filters schema
export const ticketFiltersSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  type: ticketTypeSchema.optional(),
  created_by: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
});

// Submit for approval schema (Production Order)
export const submitForApprovalSchema = z.object({
  priority: ticketPrioritySchema.default("medium"),
  due_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Export Ticket types
export type TicketStatusData = z.infer<typeof ticketStatusSchema>;
export type TicketPriorityData = z.infer<typeof ticketPrioritySchema>;
export type TicketTypeData = z.infer<typeof ticketTypeSchema>;
export type CreateTicketData = z.infer<typeof createTicketSchema>;
export type ApproveTicketData = z.infer<typeof approveTicketSchema>;
export type RejectTicketData = z.infer<typeof rejectTicketSchema>;
export type RequestChangesData = z.infer<typeof requestChangesSchema>;
export type AddTicketCommentData = z.infer<typeof addTicketCommentSchema>;
export type TicketFiltersData = z.infer<typeof ticketFiltersSchema>;
export type SubmitForApprovalData = z.infer<typeof submitForApprovalSchema>;
