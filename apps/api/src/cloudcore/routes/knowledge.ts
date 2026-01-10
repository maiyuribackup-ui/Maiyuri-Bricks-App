/**
 * Knowledge Base Route Handlers
 */

import * as knowledgeCurator from '../kernels/knowledge-curator';
import * as contracts from '../contracts';
import type {
  CloudCoreResult,
  KnowledgeEntry,
  SemanticSearchResult,
} from '../types';

/**
 * Ingest content into knowledge base
 */
export async function ingestKnowledge(
  data: contracts.KnowledgeIngestionRequest
): Promise<CloudCoreResult<KnowledgeEntry>> {
  // Validate request
  const parsed = contracts.KnowledgeIngestionRequestSchema.safeParse(data);
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

  const result: Awaited<ReturnType<typeof knowledgeCurator.ingest>> = await knowledgeCurator.ingest({
    content: parsed.data.content,
    title: parsed.data.title,
    sourceLeadId: parsed.data.sourceLeadId,
    category: parsed.data.category,
    tags: parsed.data.tags,
  });

  if (!result.success || !result.data || result.data.length === 0) {
    return {
      success: false,
      data: null,
      error: result.error || { code: 'INGEST_ERROR', message: 'No entry returned' },
    };
  }

  return {
    success: true,
    data: result.data[0],
    meta: result.meta,
  };
}

/**
 * Semantic search
 */
export async function search(
  data: contracts.SemanticSearchRequest
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  // Validate request
  const parsed = contracts.SemanticSearchRequestSchema.safeParse(data);
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

  return knowledgeCurator.search({
    query: parsed.data.query,
    limit: parsed.data.limit,
    threshold: parsed.data.threshold,
    filters: parsed.data.filters,
  });
}

/**
 * Search knowledge base only
 */
export async function searchKnowledge(
  query: string,
  options?: { limit?: number; threshold?: number }
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  if (!query || query.length < 1) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Query is required',
      },
    };
  }

  return knowledgeCurator.searchKnowledge(query, options);
}

/**
 * Search notes only
 */
export async function searchNotes(
  query: string,
  options?: { leadId?: string; limit?: number; threshold?: number }
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  if (!query || query.length < 1) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Query is required',
      },
    };
  }

  return knowledgeCurator.searchNotes(query, options);
}

/**
 * Answer a question using RAG
 */
export async function answerQuestion(
  data: contracts.QuestionAnswerRequest
): Promise<CloudCoreResult<{
  answer: string;
  sources: SemanticSearchResult[];
  confidence: number;
}>> {
  // Validate request
  const parsed = contracts.QuestionAnswerRequestSchema.safeParse(data);
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

  return knowledgeCurator.answerQuestion(parsed.data.question, {
    leadId: parsed.data.leadId,
    includeNotes: parsed.data.includeNotes,
    maxSources: parsed.data.maxSources,
    language: parsed.data.language,
  });
}

/**
 * Get knowledge entry by ID
 */
export async function getEntry(id: string): Promise<CloudCoreResult<KnowledgeEntry | null>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid entry ID format',
      },
    };
  }

  return knowledgeCurator.getEntry(id);
}

/**
 * Update knowledge entry
 */
export async function updateEntry(
  id: string,
  updates: Partial<Pick<KnowledgeEntry, 'question' | 'answer' | 'confidence'>>
): Promise<CloudCoreResult<KnowledgeEntry>> {
  // Validate ID
  const idParsed = contracts.UUIDSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid entry ID format',
      },
    };
  }

  return knowledgeCurator.updateEntry(id, updates);
}

/**
 * Delete knowledge entry
 */
export async function deleteEntry(id: string): Promise<CloudCoreResult<void>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid entry ID format',
      },
    };
  }

  return knowledgeCurator.deleteEntry(id);
}

/**
 * Backfill embeddings for entries without them
 */
export async function backfillEmbeddings(
  limit?: number
): Promise<CloudCoreResult<{ processed: number; failed: number }>> {
  return knowledgeCurator.backfillEmbeddings(limit);
}

export default {
  ingestKnowledge,
  search,
  searchKnowledge,
  searchNotes,
  answerQuestion,
  getEntry,
  updateEntry,
  deleteEntry,
  backfillEmbeddings,
};
