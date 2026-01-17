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

export const userRoleSchema = z.enum(["founder", "accountant", "engineer"]);

export const createLeadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().min(10, "Valid contact number required"),
  source: z.string().min(1, "Source is required"),
  lead_type: z.string().min(1, "Lead type is required"),
  assigned_staff: z.string().uuid("Invalid staff ID").nullable().optional(),
  status: leadStatusSchema.default("new"),
  // New classification and location fields
  classification: leadClassificationSchema.nullable().optional(),
  requirement_type: requirementTypeSchema.nullable().optional(),
  site_region: z.string().nullable().optional(),
  site_location: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  is_archived: z.boolean().default(false).optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  contact: z.string().min(10).optional(),
  source: z.string().min(1).optional(),
  lead_type: z.string().min(1).optional(),
  assigned_staff: z.string().uuid().nullable().optional(),
  status: leadStatusSchema.optional(),
  // New classification and location fields
  classification: leadClassificationSchema.nullable().optional(),
  requirement_type: requirementTypeSchema.nullable().optional(),
  site_region: z.string().nullable().optional(),
  site_location: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
  archived_at: z.string().nullable().optional(),
  archived_by: z.string().uuid().nullable().optional(),
  archive_reason: z.string().nullable().optional(),
});

export const createNoteSchema = z.object({
  lead_id: z.string().uuid("Invalid lead ID"),
  text: z.string().min(1, "Note text is required"),
  audio_url: z.string().url().optional(),
});

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
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
