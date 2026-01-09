// Lead Management Types

export type LeadStatus = 'new' | 'follow_up' | 'hot' | 'cold' | 'converted' | 'lost';

export type UserRole = 'founder' | 'accountant' | 'engineer';

export type LanguagePreference = 'en' | 'ta';

export interface AIFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface AISuggestionItem {
  type: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  source: string;
  lead_type: string;
  assigned_staff: string | null;
  status: LeadStatus;
  staff_notes?: string | null;
  ai_summary?: string | null;
  ai_score?: number | null;
  ai_factors?: AIFactor[] | null;
  ai_suggestions?: AISuggestionItem[] | null;
  next_action?: string | null;
  follow_up_date?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
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

export type ArchiveSuggestionStatus = 'pending' | 'accepted' | 'dismissed';

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

export type ArchiveCriteriaType = 'converted' | 'lost' | 'cold_inactive';

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

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

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
