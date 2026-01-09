/**
 * Supabase Service
 * Database operations and data access layer
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Lead, Note, User, KnowledgebaseEntry, CloudCoreResult } from '../../types';

// Lazy initialization to avoid build-time errors
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    _supabase = createClient(supabaseUrl, supabaseKey);
  }
  return _supabase;
}

// Proxy for lazy access
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabase(), prop);
  },
});

// ============================================
// Lead Operations
// ============================================

export async function getLead(id: string): Promise<CloudCoreResult<Lead | null>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null, meta: { processingTime: Date.now() - startTime } };
      }
      throw error;
    }

    return {
      success: true,
      data: data as Lead,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting lead:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_LEAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get lead',
      },
    };
  }
}

export async function getLeads(options?: {
  status?: string;
  assignedStaff?: string;
  limit?: number;
  offset?: number;
}): Promise<CloudCoreResult<Lead[]>> {
  const startTime = Date.now();

  try {
    let query = supabase.from('leads').select('*');

    if (options?.status) {
      query = query.eq('status', options.status);
    }
    if (options?.assignedStaff) {
      query = query.eq('assigned_staff', options.assignedStaff);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: (data || []) as Lead[],
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting leads:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_LEADS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get leads',
      },
    };
  }
}

export async function createLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<CloudCoreResult<Lead>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('leads')
      .insert(lead)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data as Lead,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error creating lead:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'CREATE_LEAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create lead',
      },
    };
  }
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<CloudCoreResult<Lead>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data as Lead,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error updating lead:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UPDATE_LEAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update lead',
      },
    };
  }
}

export async function updateLeadAI(
  id: string,
  aiFields: {
    ai_summary?: string;
    ai_score?: number;
    ai_factors?: { factor: string; impact: 'positive' | 'negative' | 'neutral' }[];
    ai_suggestions?: { type: string; content: string; priority: 'high' | 'medium' | 'low' }[];
    next_action?: string;
    follow_up_date?: string;
  }
): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('leads')
      .update({ ...aiFields, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error updating lead AI fields:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UPDATE_LEAD_AI_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update lead AI fields',
      },
    };
  }
}

// ============================================
// Note Operations
// ============================================

export async function getNotes(leadId: string): Promise<CloudCoreResult<Note[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: (data || []) as Note[],
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting notes:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_NOTES_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get notes',
      },
    };
  }
}

export async function getNote(id: string): Promise<CloudCoreResult<Note | null>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null, meta: { processingTime: Date.now() - startTime } };
      }
      throw error;
    }

    return {
      success: true,
      data: data as Note,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting note:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_NOTE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get note',
      },
    };
  }
}

export async function createNote(note: Omit<Note, 'id' | 'created_at'>): Promise<CloudCoreResult<Note>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('notes')
      .insert(note)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data as Note,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error creating note:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'CREATE_NOTE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create note',
      },
    };
  }
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<CloudCoreResult<Note>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data as Note,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error updating note:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UPDATE_NOTE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update note',
      },
    };
  }
}

export async function deleteNote(id: string): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error deleting note:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'DELETE_NOTE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete note',
      },
    };
  }
}

// ============================================
// User Operations
// ============================================

export async function getUser(id: string): Promise<CloudCoreResult<User | null>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null, meta: { processingTime: Date.now() - startTime } };
      }
      throw error;
    }

    return {
      success: true,
      data: data as User,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting user:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_USER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get user',
      },
    };
  }
}

export async function getUsers(): Promise<CloudCoreResult<User[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: (data || []) as User[],
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting users:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_USERS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get users',
      },
    };
  }
}

// ============================================
// Analytics Operations
// ============================================

export async function getSimilarLeads(
  leadType: string,
  source: string,
  limit: number = 10
): Promise<CloudCoreResult<Lead[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('lead_type', leadType)
      .eq('source', source)
      .in('status', ['converted', 'lost'])
      .limit(limit);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: (data || []) as Lead[],
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting similar leads:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_SIMILAR_LEADS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get similar leads',
      },
    };
  }
}

export async function getConversionRate(leadType: string): Promise<CloudCoreResult<number>> {
  const startTime = Date.now();

  try {
    const { data: total, error: totalError } = await supabase
      .from('leads')
      .select('id', { count: 'exact' })
      .eq('lead_type', leadType)
      .in('status', ['converted', 'lost']);

    if (totalError) {
      throw totalError;
    }

    const { data: converted, error: convertedError } = await supabase
      .from('leads')
      .select('id', { count: 'exact' })
      .eq('lead_type', leadType)
      .eq('status', 'converted');

    if (convertedError) {
      throw convertedError;
    }

    const totalCount = total?.length || 0;
    const convertedCount = converted?.length || 0;
    const rate = totalCount > 0 ? convertedCount / totalCount : 0;

    return {
      success: true,
      data: rate,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting conversion rate:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_CONVERSION_RATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get conversion rate',
      },
    };
  }
}

export async function getLeadStats(): Promise<CloudCoreResult<{
  total: number;
  byStatus: Record<string, number>;
  dueToday: number;
  overdue: number;
}>> {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Get all leads
    const { data: leads, error } = await supabase.from('leads').select('status, follow_up_date');

    if (error) {
      throw error;
    }

    const stats = {
      total: leads?.length || 0,
      byStatus: {} as Record<string, number>,
      dueToday: 0,
      overdue: 0,
    };

    for (const lead of leads || []) {
      // Count by status
      stats.byStatus[lead.status] = (stats.byStatus[lead.status] || 0) + 1;

      // Check follow-up dates
      if (lead.follow_up_date) {
        const followUpDate = lead.follow_up_date.split('T')[0];
        if (followUpDate === today) {
          stats.dueToday++;
        } else if (followUpDate < today) {
          stats.overdue++;
        }
      }
    }

    return {
      success: true,
      data: stats,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting lead stats:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_LEAD_STATS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get lead stats',
      },
    };
  }
}

// ============================================
// Staff Performance Operations
// ============================================

export async function getStaffMetrics(
  staffId: string,
  period: 'week' | 'month' | 'quarter'
): Promise<CloudCoreResult<{
  leadsHandled: number;
  conversionRate: number;
  notesCount: number;
  activeLeads: number;
}>> {
  const startTime = Date.now();

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    // Get leads for staff
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('status')
      .eq('assigned_staff', staffId);

    if (leadsError) {
      throw leadsError;
    }

    // Get notes count
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('id')
      .eq('staff_id', staffId)
      .gte('created_at', startDate.toISOString());

    if (notesError) {
      throw notesError;
    }

    const totalLeads = leads?.length || 0;
    const convertedLeads = leads?.filter((l) => l.status === 'converted').length || 0;
    const activeLeads = leads?.filter((l) => !['converted', 'lost'].includes(l.status)).length || 0;

    return {
      success: true,
      data: {
        leadsHandled: totalLeads,
        conversionRate: totalLeads > 0 ? convertedLeads / totalLeads : 0,
        notesCount: notes?.length || 0,
        activeLeads,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting staff metrics:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_STAFF_METRICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get staff metrics',
      },
    };
  }
}

export default {
  supabase,
  // Leads
  getLead,
  getLeads,
  createLead,
  updateLead,
  updateLeadAI,
  // Notes
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  // Users
  getUser,
  getUsers,
  // Analytics
  getSimilarLeads,
  getConversionRate,
  getLeadStats,
  getStaffMetrics,
};
