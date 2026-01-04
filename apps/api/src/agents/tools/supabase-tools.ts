import { createClient } from '@supabase/supabase-js';
import type { Lead, Note, User } from '@maiyuri/shared';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Read lead by ID
 */
export async function readLead(leadId: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (error) {
    console.error('Error reading lead:', error);
    return null;
  }

  return data;
}

/**
 * Read notes for a lead
 */
export async function readNotes(leadId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error reading notes:', error);
    return [];
  }

  return data || [];
}

/**
 * Read all notes (optionally filtered by staff)
 */
export async function readAllNotes(staffId?: string): Promise<Note[]> {
  let query = supabase.from('notes').select('*').order('date', { ascending: false });

  if (staffId) {
    query = query.eq('staff_id', staffId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error reading all notes:', error);
    return [];
  }

  return data || [];
}

/**
 * Update lead with AI data
 */
export async function updateLeadAI(
  leadId: string,
  updates: {
    ai_summary?: string;
    ai_score?: number;
    next_action?: string;
    follow_up_date?: string;
    status?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('leads')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('Error updating lead:', error);
    return false;
  }

  return true;
}

/**
 * Update note with AI summary
 */
export async function updateNoteAI(
  noteId: string,
  updates: {
    ai_summary?: string;
    confidence_score?: number;
  }
): Promise<boolean> {
  const { error } = await supabase.from('notes').update(updates).eq('id', noteId);

  if (error) {
    console.error('Error updating note:', error);
    return false;
  }

  return true;
}

/**
 * Get similar leads (for scoring context)
 */
export async function getSimilarLeads(
  leadType: string,
  source: string,
  limit = 10
): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('lead_type', leadType)
    .in('status', ['converted', 'lost'])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting similar leads:', error);
    return [];
  }

  return data || [];
}

/**
 * Calculate conversion rate for lead type
 */
export async function getConversionRate(leadType: string): Promise<number> {
  const { data: converted, error: convertedError } = await supabase
    .from('leads')
    .select('id', { count: 'exact' })
    .eq('lead_type', leadType)
    .eq('status', 'converted');

  const { data: total, error: totalError } = await supabase
    .from('leads')
    .select('id', { count: 'exact' })
    .eq('lead_type', leadType)
    .in('status', ['converted', 'lost']);

  if (convertedError || totalError) {
    console.error('Error calculating conversion rate');
    return 0.5; // Default 50%
  }

  const convertedCount = converted?.length || 0;
  const totalCount = total?.length || 0;

  return totalCount > 0 ? convertedCount / totalCount : 0.5;
}

/**
 * Get user by ID
 */
export async function getUser(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error getting user:', error);
    return null;
  }

  return data;
}

/**
 * Get pending leads for a staff member
 */
export async function getPendingLeads(staffId?: string): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .in('status', ['new', 'follow_up', 'hot'])
    .order('follow_up_date', { ascending: true });

  if (staffId) {
    query = query.eq('assigned_staff', staffId);
  }

  const { data, error } = await query.limit(20);

  if (error) {
    console.error('Error getting pending leads:', error);
    return [];
  }

  return data || [];
}

export default {
  readLead,
  readNotes,
  readAllNotes,
  updateLeadAI,
  updateNoteAI,
  getSimilarLeads,
  getConversionRate,
  getUser,
  getPendingLeads,
};
