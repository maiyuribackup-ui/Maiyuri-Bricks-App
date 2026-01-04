// Lead Management Types

export type LeadStatus = 'new' | 'follow_up' | 'hot' | 'cold' | 'converted' | 'lost';

export type UserRole = 'founder' | 'accountant' | 'engineer';

export interface Lead {
  id: string;
  name: string;
  contact: string;
  source: string;
  lead_type: string;
  assigned_staff: string | null;
  status: LeadStatus;
  ai_summary?: string | null;
  ai_score?: number | null;
  next_action?: string | null;
  follow_up_date?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
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
  factors: { factor: string; impact: 'positive' | 'negative' | 'neutral' }[];
}

export interface AISuggestion {
  id: string;
  type: 'action' | 'response' | 'insight';
  content: string;
  priority: 'high' | 'medium' | 'low';
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
