import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/knowledge/search - Semantic search across all content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.SemanticSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.knowledge.search(parsed.data);

    if (!result.success) {
      return error(result.error?.message || 'Search failed', 500);
    }

    return success(result.data || []);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Semantic search error:', err);
    return error('Failed to perform semantic search', 500);
  }
}
