import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

/**
 * Request schema for updating inputs
 */
const UpdateInputsRequestSchema = z.object({
  sessionId: z.string().uuid(),
  inputs: z.record(z.unknown()),
});

/**
 * POST /api/planning/inputs
 *
 * Update collected inputs for a session (Supabase persistence)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = UpdateInputsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { sessionId, inputs } = parsed.data;

    // Update inputs in Supabase
    const result = await floorPlanSupabase.updateCollectedInputs(
      sessionId,
      inputs as Record<string, unknown>
    );

    if (!result.success) {
      return error(result.error || 'Failed to update inputs', 500);
    }

    return success({ updated: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Update inputs error:', err);
    return error('Failed to update inputs', 500);
  }
}
