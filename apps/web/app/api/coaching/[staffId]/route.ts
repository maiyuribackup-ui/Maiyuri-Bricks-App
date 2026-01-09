import { NextRequest } from 'next/server';
import { routes } from '@maiyuri/api';
import { success, error, notFound } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/supabase-server';

interface RouteParams {
  params: Promise<{ staffId: string }>;
}

// Helper to get user's language preference
async function getUserLanguagePreference(request: NextRequest): Promise<'en' | 'ta'> {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) return 'en';

    const { data: user } = await getSupabaseAdmin()
      .from('users')
      .select('language_preference')
      .eq('id', authUser.id)
      .single();

    return (user?.language_preference as 'en' | 'ta') || 'en';
  } catch {
    return 'en';
  }
}

// GET /api/coaching/[staffId] - Get coaching for specific staff member
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { staffId } = await params;
    const { searchParams } = new URL(request.url);

    const period = (searchParams.get('period') || 'month') as 'week' | 'month' | 'quarter';
    const focusAreasParam = searchParams.get('focusAreas');
    const focusAreas = focusAreasParam
      ? (focusAreasParam.split(',') as ('engagement' | 'conversion' | 'response_time' | 'follow_up')[])
      : undefined;

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    const result = await routes.coaching.getCoaching({
      staffId,
      period,
      focusAreas,
      language,
    });

    if (!result.success || !result.data) {
      if (result.error?.code === 'USER_NOT_FOUND') {
        return notFound('Staff member not found');
      }
      return error(result.error?.message || 'Failed to get coaching insights', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Staff coaching error:', err);
    return error('Failed to get coaching insights', 500);
  }
}
