import { NextRequest } from 'next/server';
import { routes } from '@maiyuri/api';
import { success, error, notFound } from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ staffId: string }>;
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

    const result = await routes.coaching.getCoaching({
      staffId,
      period,
      focusAreas,
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
