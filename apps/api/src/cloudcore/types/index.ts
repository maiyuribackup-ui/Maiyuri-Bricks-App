/**
 * CloudCore Type Definitions
 */

import type { Lead, Note, User, KnowledgebaseEntry } from '@maiyuri/shared';

// Re-export shared types
export type { Lead, Note, User, KnowledgebaseEntry };

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
  };
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  score: number;
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
