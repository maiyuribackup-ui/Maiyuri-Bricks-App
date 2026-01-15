/**
 * Retry Failed Call Recording
 *
 * POST /api/admin/call-recordings/[id]/retry - Retry processing a failed recording
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, notFound } from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/admin/call-recordings/[id]/retry
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;

    if (!id) {
      return error('Recording ID is required', 400);
    }

    // Get the current recording
    const { data: recording, error: fetchError } = await supabaseAdmin
      .from('call_recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !recording) {
      return notFound('Call recording not found');
    }

    // Only allow retry for failed recordings
    if (recording.processing_status !== 'failed') {
      return error(
        `Cannot retry recording with status: ${recording.processing_status}. Only failed recordings can be retried.`,
        400
      );
    }

    // Reset the recording to pending status
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('call_recordings')
      .update({
        processing_status: 'pending',
        error_message: null,
        // Don't reset retry_count - let worker track total attempts
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Admin Retry] Update error:', updateError);
      return error('Failed to reset recording for retry', 500);
    }

    console.log(`[Admin Retry] Recording ${id} reset for retry`);

    return success({
      message: 'Recording queued for retry',
      recording: updated,
    });
  } catch (err) {
    console.error('[Admin Retry] Error:', err);
    return error('Internal server error', 500);
  }
}
