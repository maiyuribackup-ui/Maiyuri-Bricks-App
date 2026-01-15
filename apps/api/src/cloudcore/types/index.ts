/**
 * CloudCore Type Definitions
 */

import type { Lead, Note, User, KnowledgebaseEntry, CallRecording, CallRecordingInsights, LeadUrgency, ConversionLever } from '@maiyuri/shared';

// Re-export shared types
export type { Lead, Note, User, KnowledgebaseEntry, CallRecording, CallRecordingInsights, LeadUrgency, ConversionLever };

// ============================================
// Core Result Types
// ============================================

export interface CloudCoreResult<T> {
  success: boolean;
  data: T | null;
  error?: CloudCoreError;
  meta?: ResultMeta;
}

export interface CloudCoreError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResultMeta {
  processingTime: number;
  usage?: TokenUsage;
  cached?: boolean;
  [key: string]: unknown; // Allow additional custom metadata
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
}

// ============================================
// AI Provider Types
// ============================================

export type AIProvider = 'claude' | 'gemini';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  maxTokens: number;
  temperature: number;
}

export const ClaudeModels = {
  SONNET: 'claude-sonnet-4-20250514',
  HAIKU: 'claude-3-5-haiku-20241022',
} as const;

export const GeminiModels = {
  FLASH: 'gemini-2.5-flash',
  PRO: 'gemini-2.5-pro',
} as const;

export const GeminiImageModels = {
  // Image generation models - native multimodal output
  // Uses generateContent API with responseModalities: ['IMAGE']
  FLASH_IMAGE: 'gemini-2.5-flash-image',     // Nano Banana: Fast, 1024px images
  PRO_IMAGE: 'gemini-3-pro-image-preview',   // Nano Banana Pro: 4K, 14 reference images
} as const;

// ============================================
// Image Generation Types
// ============================================

export type ImageAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export type ImageSize = '1K' | '2K' | '4K';

export interface ImageGenerationConfig {
  /** Aspect ratio for generated images */
  aspectRatio?: ImageAspectRatio;
  /** Image size/resolution (only for Pro model) */
  imageSize?: ImageSize;
  /** Number of images to generate (default: 1) */
  numberOfImages?: number;
  /** Whether to include text response alongside image */
  includeTextResponse?: boolean;
}

export interface GeneratedImage {
  /** Base64-encoded image data */
  base64Data: string;
  /** MIME type of the image */
  mimeType: 'image/png' | 'image/jpeg';
}

export interface ImageGenerationResult {
  /** Generated images */
  images: GeneratedImage[];
  /** Optional text response from the model */
  text?: string;
  /** Model used for generation */
  model: string;
}

// ============================================
// Kernel Types
// ============================================

export interface KernelContext {
  requestId: string;
  userId?: string;
  staffId?: string;
  leadId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface KernelConfig {
  name: string;
  description: string;
  version: string;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
}

// ============================================
// Lead Analyst Kernel Types
// ============================================

export type AnalysisType =
  | 'full_analysis'
  | 'quick_update'
  | 'scoring_only'
  | 'suggestions_only'
  | 'summary_only';

export interface LeadAnalysisRequest {
  leadId: string;
  analysisType: AnalysisType;
  language?: 'en' | 'ta';
  context?: KernelContext;
  options?: {
    includeSimilarLeads?: boolean;
    includeHistoricalData?: boolean;
    maxNotesToAnalyze?: number;
  };
}

export interface LeadAnalysisResponse {
  leadId: string;
  summary?: LeadSummary;
  score?: LeadScore;
  suggestions?: LeadSuggestions;
  updatedFields?: Partial<Lead>;
}

export interface LeadSummary {
  text: string;
  highlights: string[];
  actionItems: string[];
  keyDates?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface LeadScore {
  value: number; // 0-1 conversion probability
  confidence: number; // 0-1 confidence in score
  factors: ScoreFactor[];
  recommendation: string;
  trend?: 'up' | 'stable' | 'down';
}

export interface ScoreFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description?: string;
}

export interface LeadSuggestions {
  items: Suggestion[];
  nextBestAction?: string;
  suggestedFollowUpDate?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Suggestion {
  id: string;
  type: 'action' | 'response' | 'insight' | 'warning';
  content: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
  dueDate?: string;
}

// ============================================
// Knowledge Curator Kernel Types
// ============================================

export interface EmbeddingRequest {
  text: string;
  sourceType: 'note' | 'lead' | 'knowledge' | 'query';
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingResponse {
  vector: number[];
  dimensions: number;
  model: string;
}

export interface SemanticSearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: {
    leadId?: string;
    dateFrom?: string;
    dateTo?: string;
    sourceTypes?: ('note' | 'lead' | 'knowledge')[];
    metadata?: Record<string, unknown>;
  };
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  score: number;
  relevanceScore?: number; // Added by LLM re-ranking
  sourceType: 'note' | 'lead' | 'knowledge';
  sourceId: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeIngestionRequest {
  content: string;
  title?: string;
  sourceLeadId?: string;
  category?: string;
  tags?: string[];
  contentType?: 'transcript' | 'objection' | 'faq' | 'manual' | 'document';
  metadata?: Record<string, unknown>;
}

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  embeddings?: number[];
  confidence: number;
  sourceLeadId?: string;
  category?: string;
  tags?: string[];
  contentType?: 'transcript' | 'objection' | 'faq' | 'manual' | 'document';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Conversion Predictor Kernel Types
// ============================================

export interface ConversionPredictionRequest {
  leadId: string;
  options?: {
    includeFactorAnalysis?: boolean;
    includeHistoricalComparison?: boolean;
    predictionHorizon?: number; // days
  };
}

export interface ConversionPrediction {
  probability: number;
  confidence: number;
  predictedDate?: string;
  factors: PredictionFactor[];
  historicalComparison?: HistoricalComparison;
}

export interface PredictionFactor {
  name: string;
  value: number;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
}

export interface HistoricalComparison {
  similarLeadsCount: number;
  averageConversionRate: number;
  averageTimeToConversion: number;
  topSuccessFactors: string[];
}

// ============================================
// Coach Kernel Types
// ============================================

export interface CoachingRequest {
  staffId: string;
  period?: 'week' | 'month' | 'quarter';
  focusAreas?: ('engagement' | 'conversion' | 'response_time' | 'follow_up')[];
  language?: 'en' | 'ta';
}

export interface CoachingResponse {
  staffId: string;
  staffName: string;
  period: string;
  metrics: StaffMetrics;
  insights: CoachingInsight[];
  recommendations: CoachingRecommendation[];
  overallScore: number;
}

export interface StaffMetrics {
  leadsHandled: number;
  conversionRate: number;
  averageResponseTime: number; // hours
  followUpCompletionRate: number;
  notesPerLead: number;
  activeLeads: number;
}

export interface CoachingInsight {
  type: 'strength' | 'improvement' | 'trend' | 'alert';
  title: string;
  description: string;
  metric?: string;
  value?: number;
  change?: number; // percentage change
}

export interface CoachingRecommendation {
  priority: 'high' | 'medium' | 'low';
  area: string;
  action: string;
  expectedImpact: string;
}

// ============================================
// Transcription Types
// ============================================

export interface TranscriptionRequest {
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  language?: 'en' | 'ta' | 'auto';
  summarize?: boolean;
}

export interface TranscriptionResponse {
  text: string;
  confidence: number;
  language: string;
  duration?: number;
  summary?: string;
  highlights?: string[];
}

// ============================================
// Memory Types
// ============================================

export interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  type: 'session' | 'conversation' | 'persistent';
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationState {
  id: string;
  leadId?: string;
  staffId?: string;
  messages: ConversationMessage[];
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Archive Curator Kernel Types
// ============================================

export interface ArchiveThreshold {
  days: number;
  enabled: boolean;
}

export interface ArchiveConfig {
  converted_days: ArchiveThreshold;
  lost_days: ArchiveThreshold;
  cold_inactivity_days: ArchiveThreshold;
}

export type ArchiveSuggestionStatus = 'pending' | 'accepted' | 'dismissed';
export type ArchiveCriteriaType = 'converted' | 'lost' | 'cold_inactive';

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

export interface ArchiveCriteria {
  type: ArchiveCriteriaType;
  days: number;
  count: number;
}

export interface ArchiveSuggestionsRequest {
  refresh?: boolean;
  userId?: string;
}

export interface ArchiveSuggestionsResponse {
  suggestions: ArchiveSuggestion[];
  criteria: ArchiveCriteria[];
  total_candidates: number;
  generated_at: string;
}

export interface BatchArchiveRequest {
  lead_ids: string[];
  reason?: string;
  archived_by?: string;
}

export interface BatchArchiveResponse {
  archived_count: number;
  lead_ids: string[];
}

export interface BatchRestoreRequest {
  lead_ids: string[];
}

export interface BatchRestoreResponse {
  restored_count: number;
  lead_ids: string[];
}

export interface ProcessSuggestionsRequest {
  suggestion_ids: string[];
  action: 'accept' | 'dismiss';
  user_id?: string;
}

export interface ProcessSuggestionsResponse {
  processed_count: number;
  archived_count?: number;
}

// ============================================
// KPI Scorer Kernel Types
// ============================================

export type KPICategory = 'lead' | 'staff' | 'business';
export type KPITimeRange = 'day' | 'week' | 'month' | 'quarter';
export type KPITrend = 'up' | 'stable' | 'down';
export type KPIAlertSeverity = 'critical' | 'warning' | 'info';
export type KPIUrgency = 'high' | 'medium' | 'low';

export interface KPIFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  currentValue: number;
  targetValue?: number;
  description: string;
}

export interface KPIScore {
  category: KPICategory;
  value: number; // 0-100 score
  trend: KPITrend;
  confidence: number; // 0-1 AI confidence
  factors: KPIFactor[];
  generatedAt: string;
}

// Lead KPI Types
export interface LeadKPIRequest {
  leadId?: string; // Single lead or all leads if not provided
  timeRange?: KPITimeRange;
}

export interface LeadKPIScore extends KPIScore {
  category: 'lead';
  leadId: string;
  leadName: string;
  status: string;
  daysSinceLastContact: number;
  recommendation: string;
  urgency: KPIUrgency;
}

export interface LeadKPIResponse {
  scores: LeadKPIScore[];
  averageScore: number;
  topPerformers: LeadKPIScore[];
  needsAttention: LeadKPIScore[];
}

// Staff KPI Types
export interface StaffKPIRequest {
  staffId?: string; // Single staff or all staff if not provided
  timeRange?: KPITimeRange;
}

export interface StaffKPIScore extends KPIScore {
  category: 'staff';
  staffId: string;
  staffName: string;
  leadsHandled: number;
  conversionRate: number;
  avgResponseTime: number;
  strengths: string[];
  improvements: string[];
}

export interface StaffKPIResponse {
  scores: StaffKPIScore[];
  teamAverageScore: number;
  topPerformers: StaffKPIScore[];
  coachingNeeded: StaffKPIScore[];
}

// Business KPI Types
export interface BusinessKPIRequest {
  timeRange?: KPITimeRange;
  compareToPrevious?: boolean;
}

export interface BusinessKPIScore extends KPIScore {
  category: 'business';
  pipelineValue: number;
  conversionVelocity: number; // avg days to convert
  leadFlow: {
    newLeads: number;
    convertedLeads: number;
    lostLeads: number;
    netChange: number;
  };
  teamEfficiency: number;
  previousPeriodScore?: number;
  changeFromPrevious?: number;
}

export interface BusinessKPIResponse {
  score: BusinessKPIScore;
  historicalTrend: { date: string; score: number }[];
  insights: string[];
}

// KPI Alert Types
export interface KPIAlert {
  id: string;
  alertType: string;
  severity: KPIAlertSeverity;
  entityType: KPICategory;
  entityId?: string;
  entityName?: string;
  message: string;
  recommendation?: string;
  createdAt: string;
  isResolved: boolean;
}

// Dashboard Response
export interface KPIDashboardResponse {
  leadScores: LeadKPIResponse;
  staffScores: StaffKPIResponse;
  businessScore: BusinessKPIResponse;
  alerts: KPIAlert[];
  recommendations: string[];
  generatedAt: string;
}

// ============================================
// Discount Advisor Kernel Types
// ============================================

export interface DiscountFactor {
  name: string;
  impact: 'increase' | 'decrease' | 'neutral';
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
  urgencyLevel: 'high' | 'medium' | 'low';
  competitiveNote?: string;
}

export interface DiscountSuggestionRequest {
  leadId: string;
  subtotal: number;
  itemsCount: number;
  distanceKm?: number;
  productCategories?: string[];
  language?: 'en' | 'ta';
}
