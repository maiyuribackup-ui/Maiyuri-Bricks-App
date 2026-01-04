import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/coaching - Get coaching insights for a staff member
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.CoachingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.coaching.getCoaching(parsed.data);

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
