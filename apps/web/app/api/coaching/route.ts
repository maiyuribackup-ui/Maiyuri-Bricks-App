export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/supabase-server';
import { ZodError } from 'zod';

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

// POST /api/coaching - Get coaching insights for a staff member
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.CoachingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    // Pass language to coaching request
    const result = await routes.coaching.getCoaching({
      ...parsed.data,
      language,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get coaching insights', 500);
    }

    return success(result.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Coaching error:', err);
    return error('Failed to get coaching insights', 500);
  }
}

// GET /api/coaching - Get team coaching summary
export async function GET(request: NextRequest) {
  try {
    const result = await routes.coaching.getTeamCoaching();

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get team coaching', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Team coaching error:', err);
    return error('Failed to get team coaching', 500);
  }
}
