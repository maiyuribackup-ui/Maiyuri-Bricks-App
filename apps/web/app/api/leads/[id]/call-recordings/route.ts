/**
 * Lead Call Recordings API
 *
 * GET /api/leads/[id]/call-recordings - Get call recordings for a specific lead
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, parseQuery } from '@/lib/api-utils';
import { type CallRecording } from '@maiyuri/shared';
import { z } from 'zod';

// Query params schema
const querySchema = z.object({
  status: z.enum(['completed', 'all']).default('completed'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/leads/[id]/call-recordings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;

    if (!leadId) {
      return error('Lead ID is required', 400);
    }

    // Parse query params
    const queryParams = parseQuery(request);
    const { status, limit, offset } = querySchema.parse(queryParams);

    // Build query
    let query = supabaseAdmin
      .from('call_recordings')
      .select('*', { count: 'exact' })
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if not 'all'
    if (status === 'completed') {
      query = query.eq('processing_status', 'completed');
    }

    const { data, error: dbError, count } = await query;

    if (dbError) {
      console.error('[Lead Call Recordings] Database error:', dbError);
      return error('Failed to fetch call recordings', 500);
    }

    return success<CallRecording[]>(data || [], {
      total: count || 0,
      limit,
      page: Math.floor(offset / limit) + 1,
    });
  } catch (err) {
    console.error('[Lead Call Recordings] Error:', err);
    if (err instanceof z.ZodError) {
      return error(`Invalid query parameters: ${err.message}`, 400);
    }
    return error('Internal server error', 500);
  }
}
