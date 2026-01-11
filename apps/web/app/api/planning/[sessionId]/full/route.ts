import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-utils';
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

/**
 * GET /api/planning/[sessionId]/full
 *
 * Load a full session with all related data (messages, progress, modifications)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return error('Invalid sessionId format', 400);
    }

    // Load full session from Supabase
    const result = await floorPlanSupabase.loadFullSession(sessionId);

    if (!result.success) {
      return error(result.error || 'Session not found', 404);
    }

    return success({
      session: result.data?.session,
      messages: result.data?.messages || [],
      progress: result.data?.progress,
      modifications: result.data?.modifications || [],
    });
  } catch (err) {
    console.error('Load full session error:', err);
    return error('Failed to load session', 500);
  }
}
