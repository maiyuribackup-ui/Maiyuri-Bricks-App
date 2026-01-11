import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { planningService } from '@/lib/planning-service';

/**
 * Request schema for confirming a blueprint
 */
const ConfirmBlueprintRequestSchema = z.object({
  sessionId: z.string().uuid(),
  confirmed: z.boolean(),
  feedback: z.string().max(1000).optional(),
});

/**
 * POST /api/planning/confirm-blueprint
 *
 * Confirm or reject the generated blueprint before proceeding to isometric view
 *
 * @example
 * POST /api/planning/confirm-blueprint
 * {
 *   "sessionId": "uuid",
 *   "confirmed": true
 * }
 *
 * Or to reject with feedback:
 * {
 *   "sessionId": "uuid",
 *   "confirmed": false,
 *   "feedback": "Please make the living room bigger"
 * }
 *
 * Response on confirmation:
 * {
 *   "status": "generating_isometric",
 *   "message": "Blueprint confirmed! Generating isometric view..."
 * }
 *
 * Response on rejection:
 * {
 *   "status": "collecting",
 *   "message": "Blueprint rejected. Please provide modifications or regenerate."
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = ConfirmBlueprintRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { sessionId, confirmed, feedback } = parsed.data;

    // Get session from planning service
    const session = planningService.getSession(sessionId);
    if (!session) {
      return error('Session not found. Please start a new session.', 404);
    }

    // Confirm or reject the blueprint
    const result = await planningService.confirmBlueprint(sessionId, confirmed, feedback);

    if (!result.success) {
      return error(result.message, 400);
    }

    // Get updated progress and stages
    const progress = planningService.getProgress(sessionId);
    const stages = planningService.getStages(sessionId);

    return success({
      status: result.status,
      message: result.message,
      ...(confirmed && progress ? {
        progress: {
          stage: progress.currentStage,
          percent: progress.percent,
          phase: progress.phase,
        },
        stages,
      } : {}),
      ...(feedback ? { feedbackRecorded: true } : {}),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Confirm blueprint error:', err);
    return error('Failed to process blueprint confirmation', 500);
  }
}

/**
 * GET /api/planning/confirm-blueprint?sessionId=uuid
 *
 * Get the blueprint image for confirmation
 *
 * @example
 * GET /api/planning/confirm-blueprint?sessionId=abc-123-uuid
 *
 * Response:
 * {
 *   "status": "awaiting_blueprint_confirmation",
 *   "blueprint": {
 *     "base64Data": "...",
 *     "mimeType": "image/png"
 *   },
 *   "designSummary": { ... }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return error('sessionId is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return error('Invalid sessionId format', 400);
    }

    // Get session from planning service
    const session = planningService.getSession(sessionId);
    if (!session) {
      return error('Session not found', 404);
    }

    if (session.status !== 'awaiting_blueprint_confirmation') {
      return error('Blueprint is not ready for confirmation', 400);
    }

    // Get blueprint image
    const blueprintImage = planningService.getBlueprintImage(sessionId);
    if (!blueprintImage) {
      return error('Blueprint image not found', 404);
    }

    // Get design context summary
    const designContext = session.designContext;
    const designSummary = designContext ? {
      plotSize: designContext.plot
        ? `${designContext.plot.width}'x${designContext.plot.depth}'`
        : undefined,
      totalArea: designContext.plot?.area,
      orientation: designContext.orientation,
      roomCount: designContext.rooms?.length,
      rooms: designContext.rooms?.map(r => ({
        name: r.name,
        type: r.type,
        areaSqft: r.areaSqft,
        zone: r.zone,
      })),
      hasCourtyard: designContext.courtyardSpec?.required,
      hasVerandah: designContext.verandaSpec?.required,
      vastuCompliant: !designContext.vastuConflicts?.some(c => c.severity === 'major'),
      ecoFeatures: designContext.ecoMandatory,
    } : {};

    return success({
      status: 'awaiting_blueprint_confirmation',
      message: 'Please review the blueprint and confirm to proceed with the isometric view.',
      blueprint: blueprintImage,
      designSummary,
      options: [
        { label: 'Looks good! Generate 3D view', value: 'confirm', primary: true },
        { label: 'I want to make changes', value: 'reject' },
      ],
    });
  } catch (err) {
    console.error('Get blueprint error:', err);
    return error('Failed to get blueprint', 500);
  }
}
