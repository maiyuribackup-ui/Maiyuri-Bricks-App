/**
 * Admin Call Recordings API
 *
 * GET /api/admin/call-recordings - List call recordings with filtering
 */

export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, parseQuery } from '@/lib/api-utils';
import {
  paginationSchema,
  callRecordingFiltersSchema,
  type CallRecording,
} from '@maiyuri/shared';

// GET /api/admin/call-recordings - List all call recordings
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);

    // Parse pagination
    const { page, limit } = paginationSchema.parse(queryParams);
    const offset = (page - 1) * limit;

    // Parse filters
    const filters = callRecordingFiltersSchema.parse(queryParams);

    // Build query
    let query = supabaseAdmin
      .from('call_recordings')
      .select('*, lead:leads(id, name, contact)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filters.processing_status) {
      query = query.eq('processing_status', filters.processing_status);
    }
    if (filters.lead_id) {
      query = query.eq('lead_id', filters.lead_id);
    }
    if (filters.phone_number) {
      query = query.ilike('phone_number', `%${filters.phone_number}%`);
    }
    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error: dbError, count } = await query;

    if (dbError) {
      console.error('[Admin Call Recordings] Database error:', dbError);
      return error('Failed to fetch call recordings', 500);
    }

    // Calculate stats
    const statsResult = await supabaseAdmin
      .from('call_recordings')
      .select('processing_status');

    const stats = {
      totalRecordings: statsResult.data?.length || 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    statsResult.data?.forEach((r) => {
      if (r.processing_status === 'pending') stats.pending++;
      else if (['downloading', 'converting', 'uploading', 'transcribing', 'analyzing'].includes(r.processing_status)) stats.processing++;
      else if (r.processing_status === 'completed') stats.completed++;
      else if (r.processing_status === 'failed') stats.failed++;
    });

    return success<CallRecording[]>(data || [], {
      total: count || 0,
      page,
      limit,
      stats,
    } as { total: number; page: number; limit: number });
  } catch (err) {
    console.error('[Admin Call Recordings] Error:', err);
    return error('Internal server error', 500);
  }
}
