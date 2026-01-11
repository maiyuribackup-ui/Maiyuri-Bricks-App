import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { planningService } from '@/lib/planning-service';

/**
 * Request schema for starting a planning session
 */
const StartSessionRequestSchema = z.object({
  projectType: z.enum(['residential', 'compound', 'commercial']),
});

/**
 * Question configuration returned to frontend
 */
interface QuestionResponse {
  id: string;
  question: string;
  type: 'single-select' | 'multi-select' | 'form' | 'upload';
  options?: {
    label: string;
    value: string;
    icon?: string;
    recommended?: boolean;
    description?: string;
  }[];
  fields?: string[];
}

/**
 * Get the first question based on project type
 */
function getFirstQuestion(projectType: string): QuestionResponse {
  // All projects start with plot input method
  return {
    id: 'plotInput',
    question:
      "Let's start with your plot. Do you have a land survey document?",
    type: 'single-select',
    options: [
      {
        label: 'Upload Survey',
        value: 'upload',
        icon: '📄',
        recommended: true,
        description: 'Auto-extract dimensions from your survey document',
      },
      {
        label: 'Enter Manually',
        value: 'manual',
        icon: '✏️',
        description: 'Type in your plot dimensions',
      },
    ],
  };
}

/**
 * POST /api/planning/start
 *
 * Initialize a new floor plan design session
 *
 * @example
 * POST /api/planning/start
 * {
 *   "projectType": "residential"
 * }
 *
 * Response:
 * {
 *   "sessionId": "uuid",
 *   "firstQuestion": { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = StartSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { projectType } = parsed.data;

    // Create session using planning service
    const session = await planningService.createSession(projectType);

    // Get first question
    const firstQuestion = getFirstQuestion(projectType);

    return success({
      sessionId: session.sessionId,
      firstQuestion,
      message: `Great! Let's design your ${projectType} project. I'll guide you through a few questions to understand your requirements.`,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Start session error:', err);
    return error('Failed to start planning session', 500);
  }
}
