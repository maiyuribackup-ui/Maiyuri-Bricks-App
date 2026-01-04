/**
 * Coaching Route Handlers
 */

import * as coach from '../kernels/coach';
import * as contracts from '../contracts';
import type { CloudCoreResult, CoachingResponse, StaffMetrics } from '../types';

/**
 * Get coaching for a staff member
 */
export async function getCoaching(
  data: contracts.CoachingRequest
): Promise<CloudCoreResult<CoachingResponse>> {
  // Validate request
  const parsed = contracts.CoachingRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  return coach.coach({
    staffId: parsed.data.staffId,
    period: parsed.data.period,
    focusAreas: parsed.data.focusAreas,
  });
}

/**
 * Get team coaching summary
 */
export async function getTeamCoaching(): Promise<CloudCoreResult<{
  teamMetrics: StaffMetrics;
  topPerformers: Array<{ staffId: string; staffName: string; score: number }>;
  improvementAreas: Array<{ area: string; description: string }>;
}>> {
  return coach.teamCoach();
}

export default {
  getCoaching,
  getTeamCoaching,
};
