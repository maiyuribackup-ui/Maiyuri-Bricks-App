export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, parseQuery } from '@/lib/api-utils';
import { paginationSchema, type Note } from '@maiyuri/shared';

// GET /api/notes - Get all notes (with optional filtering)
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);
    const { page, limit } = paginationSchema.parse(queryParams);
    const offset = (page - 1) * limit;

    // Optional filters
    const staffId = queryParams.staff_id;
    const fromDate = queryParams.from_date;
    const toDate = queryParams.to_date;

    let query = supabaseAdmin
      .from('notes')
      .select('*, leads(name, status)', { count: 'exact' })
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (staffId) {
      query = query.eq('staff_id', staffId);
    }
    if (fromDate) {
      query = query.gte('date', fromDate);
    }
    if (toDate) {
      query = query.lte('date', toDate);
    }

    const { data: notes, error: dbError, count } = await query;

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to fetch notes', 500);
    }

    return success<Note[]>(notes || [], {
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('Error fetching notes:', err);
    return error('Internal server error', 500);
  }
}
