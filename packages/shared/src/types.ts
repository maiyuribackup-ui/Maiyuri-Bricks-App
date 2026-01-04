// Lead Management Types

export type LeadStatus = 'new' | 'follow_up' | 'hot' | 'cold' | 'converted' | 'lost';

export type UserRole = 'founder' | 'accountant' | 'engineer';

export interface Lead {
  id: string;
  name: string;
  contact: string;
  source: string;
  lead_type: string;
  assigned_staff: string;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  lead_id: string;
  staff_id: string;
  text: string;
  audio_url?: string;
  transcription_text?: string;
  date: string;
  ai_summary?: string;
  confidence_score?: number;
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
  last_updated: string;
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
