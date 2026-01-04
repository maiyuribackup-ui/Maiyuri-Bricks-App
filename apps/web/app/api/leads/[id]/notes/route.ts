import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, created, error, notFound, parseBody, parseQuery } from '@/lib/api-utils';
import { createNoteSchema, paginationSchema, type Note } from '@maiyuri/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/leads/[id]/notes - Get notes for a lead
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const queryParams = parseQuery(request);
    const { page, limit } = paginationSchema.parse(queryParams);
    const offset = (page - 1) * limit;

    // Verify lead exists
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', id)
      .single();

    if (!lead) {
      return notFound('Lead not found');
    }

    // Get notes
    const { data: notes, error: dbError, count } = await supabaseAdmin
      .from('notes')
      .select('*', { count: 'exact' })
      .eq('lead_id', id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

// POST /api/leads/[id]/notes - Create a note for a lead
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify lead exists
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', id)
      .single();

    if (!lead) {
      return notFound('Lead not found');
    }

    const parsed = await parseBody(request, createNoteSchema);
    if (parsed.error) return parsed.error;

    // Ensure lead_id matches the route param
    const noteData = {
      ...parsed.data,
      lead_id: id,
    };

    const { data: note, error: dbError } = await supabaseAdmin
      .from('notes')
      .insert(noteData)
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to create note', 500);
    }

    return created<Note>(note);
  } catch (err) {
    console.error('Error creating note:', err);
    return error('Internal server error', 500);
  }
}
