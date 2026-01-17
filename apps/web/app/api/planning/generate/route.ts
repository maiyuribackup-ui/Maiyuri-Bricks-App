import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { planningService } from '@/lib/planning-service';

/**
 * Request schema for triggering generation from collected inputs
 */
const GenerateRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  projectType: z.enum(['residential', 'compound', 'commercial']),
  inputs: z.record(z.unknown()),
});

/**
 * POST /api/planning/generate
 *
 * Trigger generation directly from collected inputs.
 * This is a safety net for cases where the frontend local flow completed
 * without a backend session.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = GenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { sessionId, projectType, inputs } = parsed.data;

    // Create or load session
    const session = sessionId
      ? await planningService.getSessionAsync(sessionId)
      : await planningService.createSession(projectType);

    if (!session) {
      return error('Session not found', 404);
    }

    // Merge inputs and trigger generation
    await planningService.updateInputs(session.sessionId, {
      projectType,
      ...inputs,
    });

    planningService.startGeneration(session.sessionId).catch((err) => {
      console.error('Generation error:', err);
    });

    const progress = planningService.getProgress(session.sessionId);

    return success({
      status: 'generating',
      sessionId: session.sessionId,
      message: 'Starting design process...',
      progress: {
        stage: progress?.currentStage || 'Starting design process...',
        percent: progress?.percent || 0,
        stages: planningService.getStages(session.sessionId),
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Generate error:', err);
    return error('Failed to start generation', 500);
  }
}
