import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/knowledge - Ingest content into knowledge base
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.KnowledgeIngestionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.knowledge.ingestKnowledge(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to ingest knowledge', 500);
    }

    return success(result.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Knowledge ingestion error:', err);
    return error('Failed to ingest knowledge', 500);
  }
}

// GET /api/knowledge - Search knowledge base
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');

    if (!query) {
      return error('Query parameter (q or query) is required', 400);
    }

    const result = await routes.knowledge.searchKnowledge(query, { limit, threshold });

    if (!result.success) {
      return error(result.error?.message || 'Search failed', 500);
    }

    return success(result.data || []);
  } catch (err) {
    console.error('Knowledge search error:', err);
    return error('Failed to search knowledge base', 500);
  }
}
