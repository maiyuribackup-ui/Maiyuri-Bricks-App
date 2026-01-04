import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/knowledge/ask - Ask a question using RAG
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.QuestionAnswerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.knowledge.answerQuestion(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to answer question', 500);
    }

    return success(result.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Question answering error:', err);
    return error('Failed to answer question', 500);
  }
}
