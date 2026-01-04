/**
 * CloudCore API Contracts
 * Zod schemas for request/response validation
 */

import { z } from 'zod';

// ============================================
// Common Schemas
// ============================================

export const UUIDSchema = z.string().uuid();

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      })
      .nullable()
      .optional(),
    meta: z
      .object({
        processingTime: z.number().optional(),
        total: z.number().optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      })
      .optional(),
  });

// ============================================
// Lead Analysis Contracts
// ============================================

export const AnalysisTypeSchema = z.enum([
  'full_analysis',
  'quick_update',
  'scoring_only',
  'suggestions_only',
  'summary_only',
]);

export const LeadAnalysisRequestSchema = z.object({
  leadId: UUIDSchema,
  analysisType: AnalysisTypeSchema.default('full_analysis'),
  options: z
    .object({
      includeSimilarLeads: z.boolean().default(false),
      includeHistoricalData: z.boolean().default(false),
      maxNotesToAnalyze: z.number().int().positive().max(50).default(10),
    })
    .optional(),
});

export const LeadSummarySchema = z.object({
  text: z.string(),
  highlights: z.array(z.string()),
  actionItems: z.array(z.string()),
  keyDates: z.array(z.string()).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
});

export const LeadScoreSchema = z.object({
  value: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  factors: z.array(
    z.object({
      name: z.string(),
      impact: z.enum(['positive', 'negative', 'neutral']),
      weight: z.number().min(0).max(1),
      description: z.string().optional(),
    })
  ),
  recommendation: z.string(),
  trend: z.enum(['up', 'stable', 'down']).optional(),
});

export const SuggestionSchema = z.object({
  id: z.string(),
  type: z.enum(['action', 'response', 'insight', 'warning']),
  content: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
  dueDate: z.string().optional(),
});

export const LeadSuggestionsSchema = z.object({
  items: z.array(SuggestionSchema),
  nextBestAction: z.string().optional(),
  suggestedFollowUpDate: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']),
});

export const LeadAnalysisResponseSchema = z.object({
  leadId: UUIDSchema,
  summary: LeadSummarySchema.optional(),
  score: LeadScoreSchema.optional(),
  suggestions: LeadSuggestionsSchema.optional(),
  updatedFields: z.record(z.unknown()).optional(),
});

// ============================================
// Conversion Prediction Contracts
// ============================================

export const ConversionPredictionRequestSchema = z.object({
  leadId: UUIDSchema,
  options: z
    .object({
      includeFactorAnalysis: z.boolean().default(true),
      includeHistoricalComparison: z.boolean().default(false),
      predictionHorizon: z.number().int().positive().default(30),
    })
    .optional(),
});

export const PredictionFactorSchema = z.object({
  name: z.string(),
  value: z.number(),
  impact: z.enum(['positive', 'negative', 'neutral']),
  weight: z.number().min(0).max(1),
});

export const HistoricalComparisonSchema = z.object({
  similarLeadsCount: z.number(),
  averageConversionRate: z.number(),
  averageTimeToConversion: z.number(),
  topSuccessFactors: z.array(z.string()),
});

export const ConversionPredictionResponseSchema = z.object({
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  predictedDate: z.string().optional(),
  factors: z.array(PredictionFactorSchema),
  historicalComparison: HistoricalComparisonSchema.optional(),
});

// ============================================
// Knowledge Base Contracts
// ============================================

export const KnowledgeIngestionRequestSchema = z.object({
  content: z.string().min(10).max(50000),
  title: z.string().max(200).optional(),
  sourceLeadId: UUIDSchema.optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

export const KnowledgeEntrySchema = z.object({
  id: UUIDSchema,
  question: z.string(),
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  sourceLeadId: UUIDSchema.nullable().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SemanticSearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().positive().max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  filters: z
    .object({
      leadId: UUIDSchema.optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      sourceTypes: z.array(z.enum(['note', 'lead', 'knowledge'])).optional(),
    })
    .optional(),
});

export const SemanticSearchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: z.number().min(0).max(1),
  sourceType: z.enum(['note', 'lead', 'knowledge']),
  sourceId: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const QuestionAnswerRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  leadId: UUIDSchema.optional(),
  includeNotes: z.boolean().default(true),
  maxSources: z.number().int().positive().max(10).default(5),
});

export const QuestionAnswerResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(SemanticSearchResultSchema),
  confidence: z.number().min(0).max(1),
});

// ============================================
// Coaching Contracts
// ============================================

export const CoachingRequestSchema = z.object({
  staffId: UUIDSchema,
  period: z.enum(['week', 'month', 'quarter']).default('month'),
  focusAreas: z
    .array(z.enum(['engagement', 'conversion', 'response_time', 'follow_up']))
    .optional(),
});

export const StaffMetricsSchema = z.object({
  leadsHandled: z.number(),
  conversionRate: z.number().min(0).max(1),
  averageResponseTime: z.number(),
  followUpCompletionRate: z.number().min(0).max(1),
  notesPerLead: z.number(),
  activeLeads: z.number(),
});

export const CoachingInsightSchema = z.object({
  type: z.enum(['strength', 'improvement', 'trend', 'alert']),
  title: z.string(),
  description: z.string(),
  metric: z.string().optional(),
  value: z.number().optional(),
  change: z.number().optional(),
});

export const CoachingRecommendationSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  area: z.string(),
  action: z.string(),
  expectedImpact: z.string(),
});

export const CoachingResponseSchema = z.object({
  staffId: UUIDSchema,
  staffName: z.string(),
  period: z.string(),
  metrics: StaffMetricsSchema,
  insights: z.array(CoachingInsightSchema),
  recommendations: z.array(CoachingRecommendationSchema),
  overallScore: z.number().min(0).max(1),
});

// ============================================
// Transcription Contracts
// ============================================

export const TranscriptionRequestSchema = z.object({
  audioUrl: z.string().url().optional(),
  audioBase64: z.string().optional(),
  mimeType: z.string().default('audio/mpeg'),
  language: z.enum(['en', 'ta', 'auto']).default('auto'),
  summarize: z.boolean().default(false),
}).refine(
  (data) => data.audioUrl || data.audioBase64,
  { message: 'Either audioUrl or audioBase64 is required' }
);

export const TranscriptionResponseSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  duration: z.number().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
});

// ============================================
// Note Contracts
// ============================================

export const CreateNoteRequestSchema = z.object({
  leadId: UUIDSchema,
  text: z.string().min(1).max(10000),
  date: z.string(),
  staffId: UUIDSchema.optional(),
  audioUrl: z.string().url().optional(),
});

export const UpdateNoteRequestSchema = z.object({
  text: z.string().min(1).max(10000).optional(),
  date: z.string().optional(),
  transcriptionText: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  aiSummary: z.string().optional(),
});

export const NoteSchema = z.object({
  id: UUIDSchema,
  leadId: UUIDSchema,
  staffId: UUIDSchema.nullable(),
  text: z.string(),
  audioUrl: z.string().nullable().optional(),
  transcriptionText: z.string().nullable().optional(),
  date: z.string(),
  aiSummary: z.string().nullable().optional(),
  confidenceScore: z.number().nullable().optional(),
  createdAt: z.string(),
});

// ============================================
// Lead Contracts
// ============================================

export const LeadStatusSchema = z.enum(['new', 'follow_up', 'hot', 'cold', 'converted', 'lost']);

export const CreateLeadRequestSchema = z.object({
  name: z.string().min(1).max(200),
  contact: z.string().min(1).max(50),
  source: z.string().min(1).max(100),
  leadType: z.string().min(1).max(100),
  assignedStaff: UUIDSchema.optional(),
  status: LeadStatusSchema.default('new'),
});

export const UpdateLeadRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contact: z.string().min(1).max(50).optional(),
  source: z.string().min(1).max(100).optional(),
  leadType: z.string().min(1).max(100).optional(),
  assignedStaff: UUIDSchema.nullable().optional(),
  status: LeadStatusSchema.optional(),
  followUpDate: z.string().optional(),
});

export const LeadSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  contact: z.string(),
  source: z.string(),
  leadType: z.string(),
  assignedStaff: UUIDSchema.nullable(),
  status: LeadStatusSchema,
  aiSummary: z.string().nullable().optional(),
  aiScore: z.number().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  followUpDate: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: UUIDSchema.nullable().optional(),
});

// ============================================
// Dashboard Contracts
// ============================================

export const DashboardStatsResponseSchema = z.object({
  total: z.number(),
  byStatus: z.record(z.number()),
  dueToday: z.number(),
  overdue: z.number(),
});

// ============================================
// Type exports
// ============================================

export type LeadAnalysisRequest = z.infer<typeof LeadAnalysisRequestSchema>;
export type LeadAnalysisResponse = z.infer<typeof LeadAnalysisResponseSchema>;
export type ConversionPredictionRequest = z.infer<typeof ConversionPredictionRequestSchema>;
export type ConversionPredictionResponse = z.infer<typeof ConversionPredictionResponseSchema>;
export type KnowledgeIngestionRequest = z.infer<typeof KnowledgeIngestionRequestSchema>;
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
export type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;
export type SemanticSearchResult = z.infer<typeof SemanticSearchResultSchema>;
export type QuestionAnswerRequest = z.infer<typeof QuestionAnswerRequestSchema>;
export type QuestionAnswerResponse = z.infer<typeof QuestionAnswerResponseSchema>;
export type CoachingRequest = z.infer<typeof CoachingRequestSchema>;
export type CoachingResponse = z.infer<typeof CoachingResponseSchema>;
export type TranscriptionRequest = z.infer<typeof TranscriptionRequestSchema>;
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type UpdateLeadRequest = z.infer<typeof UpdateLeadRequestSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type DashboardStatsResponse = z.infer<typeof DashboardStatsResponseSchema>;
