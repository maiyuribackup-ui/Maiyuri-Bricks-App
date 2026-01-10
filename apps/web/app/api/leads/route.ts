import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, created, error, parseBody, parseQuery } from '@/lib/api-utils';
import { notifyNewLead } from '@/lib/telegram';
import {
  createLeadSchema,
  paginationSchema,
  leadFiltersSchema,
  type Lead,
} from '@maiyuri/shared';

// GET /api/leads - List all leads with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);

    // Parse pagination
    const { page, limit } = paginationSchema.parse(queryParams);
    const offset = (page - 1) * limit;

    // Parse filters
    const filters = leadFiltersSchema.parse(queryParams);

    // Build query
    let query = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.assigned_staff) {
      query = query.eq('assigned_staff', filters.assigned_staff);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,contact.ilike.%${filters.search}%`);
    }
    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }
    
    // Filter by archive status (default to active only)
    query = query.eq('is_archived', filters.is_archived ?? false);

    const { data, error: dbError, count } = await query;

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to fetch leads', 500);
    }

    return success<Lead[]>(data || [], {
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('Error fetching leads:', err);
    return error('Internal server error', 500);
  }
}

// POST /api/leads - Create a new lead
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, createLeadSchema);
    if (parsed.error) return parsed.error;

    const { data: lead, error: dbError } = await supabaseAdmin
      .from('leads')
      .insert(parsed.data)
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to create lead', 500);
    }

    // Send Telegram notification (non-blocking)
    notifyNewLead(lead.name, lead.contact, lead.source).catch((err) => {
      console.error('Failed to send Telegram notification:', err);
    });

    return created<Lead>(lead);
  } catch (err) {
    console.error('Error creating lead:', err);
    return error('Internal server error', 500);
  }
}
