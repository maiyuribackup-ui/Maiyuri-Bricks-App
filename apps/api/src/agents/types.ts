import type { Lead, Note, AISummary, AIScore, AISuggestion } from '@maiyuri/shared';

// Agent Result Types
export interface AgentResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Summarization Agent Types
export interface SummarizationInput {
  notes: Note[];
  lead?: Lead;
  maxLength?: number;
}

export interface SummarizationOutput {
  summary: string;
  highlights: string[];
  actionItems: string[];
  keyDates?: string[];
}

// Scoring Agent Types
export interface ScoringInput {
  lead: Lead;
  notes: Note[];
  historicalData?: {
    similarLeads: Lead[];
    conversionRate: number;
  };
}

export interface ScoringOutput {
  score: number; // 0-1
  confidence: number; // 0-1
  factors: {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }[];
  recommendation: string;
}

// Suggestion Agent Types
export interface SuggestionInput {
  lead: Lead;
  notes: Note[];
  context?: {
    recentActions?: string[];
    staffWorkload?: number;
  };
}

export interface SuggestionOutput {
  suggestions: {
    id: string;
    type: 'action' | 'response' | 'insight';
    content: string;
    priority: 'high' | 'medium' | 'low';
    reasoning: string;
  }[];
  nextBestAction?: string;
  suggestedFollowUpDate?: string;
}

// Lead Manager Agent Types (Orchestrator)
export interface LeadManagerInput {
  lead: Lead;
  notes: Note[];
  requestType: 'full_analysis' | 'quick_update' | 'scoring_only' | 'suggestions_only';
}

export interface LeadManagerOutput {
  leadId: string;
  summary?: SummarizationOutput;
  score?: ScoringOutput;
  suggestions?: SuggestionOutput;
  updatedLead?: Partial<Lead>;
  processingTime: number;
}

// Tool Types
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (input: unknown) => Promise<unknown>;
}

// Agent Configuration
export interface AgentConfig {
  name: string;
  description: string;
  model: 'claude-sonnet-4-20250514' | 'claude-3-5-sonnet-20241022';
  maxTokens: number;
  temperature: number;
  tools?: AgentTool[];
}

// Agent Context
export interface AgentContext {
  leadId?: string;
  staffId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}
