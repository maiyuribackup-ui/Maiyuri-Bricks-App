/**
 * Embeddings Service
 * Vector embeddings for semantic search using Gemini + pgvector
 */

import * as gemini from '../ai/gemini';
import { supabase } from '../supabase';
import type {
  CloudCoreResult,
  EmbeddingRequest,
  EmbeddingResponse,
  SemanticSearchRequest,
  SemanticSearchResult,
} from '../../types';

const EMBEDDING_DIMENSIONS = 768;

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(
  request: EmbeddingRequest
): Promise<CloudCoreResult<EmbeddingResponse>> {
  const result = await gemini.generateEmbedding(request.text);

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error,
      meta: result.meta,
    };
  }

  return {
    success: true,
    data: {
      vector: result.data.vector,
      dimensions: result.data.dimensions,
      model: result.data.model,
    },
    meta: result.meta,
  };
}

/**
 * Generate and store embedding for a note
 */
export async function embedNote(
  noteId: string,
  text: string
): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    // Generate embedding
    const embeddingResult = await gemini.generateEmbedding(text);
    if (!embeddingResult.success || !embeddingResult.data) {
      return {
        success: false,
        data: null,
        error: embeddingResult.error,
      };
    }

    // Store embedding in notes table
    const { error } = await supabase
      .from('notes')
      .update({ embeddings: embeddingResult.data.vector })
      .eq('id', noteId);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: null,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Error embedding note:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'EMBED_NOTE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to embed note',
      },
    };
  }
}

/**
 * Generate and store embedding for a knowledge base entry
 */
export async function embedKnowledgeEntry(
  entryId: string,
  text: string
): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    // Generate embedding
    const embeddingResult = await gemini.generateEmbedding(text);
    if (!embeddingResult.success || !embeddingResult.data) {
      return {
        success: false,
        data: null,
        error: embeddingResult.error,
      };
    }

    // Store embedding in knowledgebase table
    const { error } = await supabase
      .from('knowledgebase')
      .update({ embeddings: embeddingResult.data.vector })
      .eq('id', entryId);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: null,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Error embedding knowledge entry:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'EMBED_KNOWLEDGE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to embed knowledge entry',
      },
    };
  }
}

/**
 * Semantic search across notes
 */
export async function searchNotes(
  request: SemanticSearchRequest
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  const startTime = Date.now();

  try {
    // Generate embedding for query
    const embeddingResult = await gemini.generateEmbedding(request.query);
    if (!embeddingResult.success || !embeddingResult.data) {
      return {
        success: false,
        data: null,
        error: embeddingResult.error,
      };
    }

    const queryEmbedding = embeddingResult.data.vector;
    const limit = request.limit || 10;
    const threshold = request.threshold || 0.7;

    // Search using pgvector
    const { data, error } = await supabase.rpc('match_notes', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_lead_id: request.filters?.leadId || null,
    });

    if (error) {
      throw error;
    }

    const results: SemanticSearchResult[] = (data || []).map((item: {
      id: string;
      text: string;
      similarity: number;
      lead_id: string;
      created_at: string;
    }) => ({
      id: item.id,
      content: item.text,
      score: item.similarity,
      sourceType: 'note' as const,
      sourceId: item.id,
      metadata: {
        leadId: item.lead_id,
        createdAt: item.created_at,
      },
    }));

    return {
      success: true,
      data: results,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Error searching notes:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SEARCH_NOTES_ERROR',
        message: error instanceof Error ? error.message : 'Failed to search notes',
      },
    };
  }
}

/**
 * Semantic search across knowledge base
 */
export async function searchKnowledge(
  request: SemanticSearchRequest
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  const startTime = Date.now();

  try {
    // Generate embedding for query
    const embeddingResult = await gemini.generateEmbedding(request.query);
    if (!embeddingResult.success || !embeddingResult.data) {
      return {
        success: false,
        data: null,
        error: embeddingResult.error,
      };
    }

    const queryEmbedding = embeddingResult.data.vector;
    const limit = request.limit || 10;
    const threshold = request.threshold || 0.7;

    // Search using pgvector
    const { data, error } = await supabase.rpc('match_knowledge', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      throw error;
    }

    const results: SemanticSearchResult[] = (data || []).map((item: {
      id: string;
      answer_text: string;
      similarity: number;
      source_lead_id: string;
    }) => ({
      id: item.id,
      content: item.answer_text,
      score: item.similarity,
      sourceType: 'knowledge' as const,
      sourceId: item.id,
      metadata: {
        sourceLeadId: item.source_lead_id,
      },
    }));

    return {
      success: true,
      data: results,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Error searching knowledge:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SEARCH_KNOWLEDGE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to search knowledge',
      },
    };
  }
}

/**
 * Unified semantic search across all sources
 */
export async function search(
  request: SemanticSearchRequest
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  const startTime = Date.now();

  try {
    const sourceTypes = request.filters?.sourceTypes || ['note', 'knowledge'];
    const results: SemanticSearchResult[] = [];

    // Search in parallel
    const promises: Promise<CloudCoreResult<SemanticSearchResult[]>>[] = [];

    if (sourceTypes.includes('note')) {
      promises.push(searchNotes(request));
    }

    if (sourceTypes.includes('knowledge')) {
      promises.push(searchKnowledge(request));
    }

    const searchResults = await Promise.all(promises);

    for (const result of searchResults) {
      if (result.success && result.data) {
        results.push(...result.data);
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, request.limit || 10);

    return {
      success: true,
      data: limitedResults,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Error in unified search:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UNIFIED_SEARCH_ERROR',
        message: error instanceof Error ? error.message : 'Unified search failed',
      },
    };
  }
}

/**
 * Batch embed all notes without embeddings
 */
export async function backfillNoteEmbeddings(
  limit: number = 100
): Promise<CloudCoreResult<{ processed: number; failed: number }>> {
  const startTime = Date.now();

  try {
    // Find notes without embeddings
    const { data: notes, error } = await supabase
      .from('notes')
      .select('id, text')
      .is('embeddings', null)
      .limit(limit);

    if (error) {
      throw error;
    }

    if (!notes || notes.length === 0) {
      return {
        success: true,
        data: { processed: 0, failed: 0 },
        meta: { processingTime: Date.now() - startTime },
      };
    }

    let processed = 0;
    let failed = 0;

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < notes.length; i += batchSize) {
      const batch = notes.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((note) => embedNote(note.id, note.text))
      );

      for (const result of results) {
        if (result.success) {
          processed++;
        } else {
          failed++;
        }
      }
    }

    return {
      success: true,
      data: { processed, failed },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error backfilling embeddings:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'BACKFILL_ERROR',
        message: error instanceof Error ? error.message : 'Backfill failed',
      },
    };
  }
}

export default {
  generateEmbedding,
  embedNote,
  embedKnowledgeEntry,
  searchNotes,
  searchKnowledge,
  search,
  backfillNoteEmbeddings,
};
