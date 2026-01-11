import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-utils';
import { planningService } from '@/lib/planning-service';

/**
 * GET /api/planning/[sessionId]/status
 *
 * Get the current status of a planning session
 *
 * @example
 * GET /api/planning/abc-123-uuid/status
 *
 * Response:
 * {
 *   "status": "in_progress",
 *   "currentStage": "Rendering 3D view",
 *   "progress": 65,
 *   "stages": [...]
 * }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Get session from planning service
    const session = planningService.getSession(sessionId);
    if (!session) {
      return error('Session not found', 404);
    }

    // Get progress data
    const progress = planningService.getProgress(sessionId);
    const stages = planningService.getStages(sessionId);

    // Handle different session states
    switch (session.status) {
      case 'collecting':
        return success({
          status: 'collecting',
          inputs: session.inputs,
          currentQuestionIndex: session.currentQuestionIndex,
        });

      case 'generating':
        if (!progress) {
          // Generation hasn't started yet - start it
          planningService.startGeneration(sessionId).catch(err => {
            console.error('Generation error:', err);
          });

          return success({
            status: 'pending',
            currentStage: 'Starting design process...',
            progress: 0,
            phase: 'blueprint',
            stages,
          });
        }

        return success({
          status: progress.status,
          currentStage: progress.currentStage,
          currentAgent: progress.currentAgent,
          progress: progress.percent,
          phase: progress.phase,
          stages,
          ...(progress.status === 'complete' && progress.result
            ? { result: progress.result }
            : {}),
          ...(progress.status === 'failed' && progress.error
            ? { error: progress.error }
            : {}),
        });

      case 'awaiting_blueprint_confirmation':
        return success({
          status: 'awaiting_blueprint_confirmation',
          message: 'Blueprint ready! Please review and confirm to proceed with the 3D isometric view.',
          currentStage: 'Blueprint ready - awaiting your confirmation',
          progress: progress?.percent || 70,
          phase: 'blueprint',
          stages,
          blueprint: session.blueprintImage,
          designSummary: {
            plotSize: session.designContext?.plot
              ? `${session.designContext.plot.width}'×${session.designContext.plot.depth}'`
              : undefined,
            roomCount: session.designContext?.rooms?.length,
            rooms: session.designContext?.rooms?.map(r => ({
              name: r.name,
              type: r.type,
              areaSqft: r.areaSqft,
            })),
            hasCourtyard: session.designContext?.courtyardSpec?.required,
            hasVerandah: session.designContext?.verandaSpec?.required,
            vastuCompliant: !session.designContext?.vastuConflicts?.some(
              c => c.severity === 'major'
            ),
          },
          confirmationOptions: [
            { label: 'Looks good! Generate 3D view', value: 'confirm', primary: true },
            { label: 'I want to make changes', value: 'reject' },
          ],
        });

      case 'generating_isometric':
        return success({
          status: 'generating_isometric',
          currentStage: progress?.currentStage || 'Generating isometric view...',
          currentAgent: progress?.currentAgent,
          progress: progress?.percent || 80,
          phase: 'isometric',
          stages,
          blueprint: session.blueprintImage,
        });

      case 'halted':
        return success({
          status: 'halted',
          message: 'Awaiting clarification',
          openQuestions: session.designContext?.openQuestions || [],
          phase: progress?.phase || 'blueprint',
          stages,
        });

      case 'complete':
        return success({
          status: 'complete',
          result: progress?.result || {
            images: {
              floorPlan: session.designContext?.generatedImages?.floorPlan,
              courtyard: session.designContext?.generatedImages?.courtyard,
              exterior: session.designContext?.generatedImages?.exterior,
            },
            designContext: {
              rooms: session.designContext?.rooms,
              plot: session.designContext?.plot,
              vastuZones: session.designContext?.vastuZones,
              ecoMandatory: session.designContext?.ecoMandatory,
              validationStatus: session.designContext?.validationStatus,
            },
          },
          summary: {
            plotSize: session.designContext?.plot
              ? `${session.designContext.plot.width}'×${session.designContext.plot.depth}'`
              : undefined,
            totalBuiltUp: session.designContext?.totalBuiltUp,
            roomCount: session.designContext?.rooms?.length,
            hasCourtyard: session.designContext?.courtyardSpec?.required,
            hasVerandah: session.designContext?.verandaSpec?.required,
            vastuCompliant: !session.designContext?.vastuConflicts?.some(
              c => c.severity === 'major'
            ),
            ecoFeatures: session.designContext?.ecoMandatory,
          },
          stages,
        });

      case 'failed':
        return success({
          status: 'failed',
          error: session.error || progress?.error || 'Generation failed',
          phase: progress?.phase || 'blueprint',
          stages,
        });

      default:
        return success({
          status: session.status,
          inputs: session.inputs,
        });
    }
  } catch (err) {
    console.error('Get status error:', err);
    return error('Failed to get session status', 500);
  }
}
