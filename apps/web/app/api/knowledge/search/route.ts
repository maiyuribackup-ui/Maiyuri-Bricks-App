import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// GET /api/knowledge/search?q=...&limit=10&threshold=0.7 - Semantic search via query params
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');

    if (!query) {
      return error('Query parameter (q or query) is required', 400);
    }

    const result = await routes.knowledge.search({
      query,
      limit,
      threshold,
    });

    if (!result.success) {
      return error(result.error?.message || 'Search failed', 500);
    }

    return success(result.data || []);
  } catch (err) {
    console.error('Knowledge search error:', err);
    return error('Failed to search knowledge base', 500);
  }
}

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
