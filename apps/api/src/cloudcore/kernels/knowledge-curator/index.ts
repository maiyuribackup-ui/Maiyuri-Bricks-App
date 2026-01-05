/**
 * Knowledge Curator Kernel
 * Manages knowledge base, embeddings, and semantic search (RAG)
 * Uses Gemini for embeddings
 */

import * as gemini from '../../services/ai/gemini';
import * as embeddings from '../../services/embeddings';
import * as scraper from '../../services/scraper';
import { supabase } from '../../services/supabase';
import type {
  CloudCoreResult,
  KnowledgeEntry,
  KnowledgeIngestionRequest,
  SemanticSearchRequest,
  SemanticSearchResult,
} from '../../types';
import type { ScrapeOptions, ScrapedPage } from '../../services/scraper';

export const KERNEL_CONFIG = {
  name: 'KnowledgeCurator',
  description: 'Manages knowledge base and semantic search',
  version: '1.0.0',
  defaultModel: 'text-embedding-004',
  maxTokens: 2048,
  temperature: 0,
};

/**
 * Ingest content into knowledge base
 */
export async function ingest(
  request: KnowledgeIngestionRequest
): Promise<CloudCoreResult<KnowledgeEntry>> {
  const startTime = Date.now();

  try {
    // Generate Q&A pair from content using Gemini
    const qaResult = await gemini.complete({
      prompt: `Analyze this content and extract the key question it answers and a comprehensive answer.

Content:
${request.content}

Respond with JSON:
{
  "question": "What question does this content answer?",
  "answer": "The comprehensive answer based on the content"
}`,
    });

    if (!qaResult.success || !qaResult.data) {
      return {
        success: false,
        data: null,
        error: qaResult.error,
      };
    }

    // Parse Q&A
    let qa: { question: string; answer: string };
    try {
      const content = qaResult.data.content.trim();
      let jsonStr = content;
      if (content.startsWith('```json')) {
        jsonStr = content.slice(7, content.lastIndexOf('```')).trim();
      } else if (content.startsWith('```')) {
        jsonStr = content.slice(3, content.lastIndexOf('```')).trim();
      }
      qa = JSON.parse(jsonStr);
    } catch {
      qa = {
        question: request.title || 'Knowledge Entry',
        answer: request.content,
      };
    }

    // Generate embedding
    const embeddingResult = await gemini.generateEmbedding(
      `${qa.question} ${qa.answer}`
    );

    if (!embeddingResult.success || !embeddingResult.data) {
      return {
        success: false,
        data: null,
        error: embeddingResult.error,
      };
    }

    // Store in database
    const { data, error } = await supabase
      .from('knowledgebase')
      .insert({
        question_text: qa.question,
        answer_text: qa.answer,
        embeddings: embeddingResult.data.vector,
        confidence_score: 0.9,
        source_lead_id: request.sourceLeadId,
        created_by: null, // Will be set by RLS or API
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const entry: KnowledgeEntry = {
      id: data.id,
      question: data.question_text,
      answer: data.answer_text,
      embeddings: data.embeddings,
      confidence: data.confidence_score,
      sourceLeadId: data.source_lead_id,
      category: request.category,
      tags: request.tags,
      createdAt: data.created_at,
      updatedAt: data.last_updated,
    };

    return {
      success: true,
      data: entry,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Knowledge ingestion error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'INGESTION_ERROR',
        message: error instanceof Error ? error.message : 'Ingestion failed',
      },
    };
  }
}

/**
 * Semantic search across knowledge base
 */
export async function search(
  request: SemanticSearchRequest
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  return embeddings.search(request);
}

/**
 * Search knowledge base only
 */
export async function searchKnowledge(
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
  }
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  return embeddings.searchKnowledge({
    query,
    limit: options?.limit || 5,
    threshold: options?.threshold || 0.7,
  });
}

/**
 * Search notes only
 */
export async function searchNotes(
  query: string,
  options?: {
    leadId?: string;
    limit?: number;
    threshold?: number;
  }
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  return embeddings.searchNotes({
    query,
    limit: options?.limit || 10,
    threshold: options?.threshold || 0.7,
    filters: {
      leadId: options?.leadId,
    },
  });
}

/**
 * Answer a question using RAG (Retrieval-Augmented Generation)
 */
export async function answerQuestion(
  question: string,
  options?: {
    leadId?: string;
    includeNotes?: boolean;
    maxSources?: number;
  }
): Promise<CloudCoreResult<{
  answer: string;
  sources: SemanticSearchResult[];
  confidence: number;
}>> {
  const startTime = Date.now();

  try {
    const maxSources = options?.maxSources || 5;
    const sources: SemanticSearchResult[] = [];

    // Search knowledge base
    const knowledgeResults = await embeddings.searchKnowledge({
      query: question,
      limit: maxSources,
      threshold: 0.7,
    });

    if (knowledgeResults.success && knowledgeResults.data) {
      sources.push(...knowledgeResults.data);
    }

    // Optionally search notes
    if (options?.includeNotes) {
      const notesResults = await embeddings.searchNotes({
        query: question,
        limit: maxSources,
        threshold: 0.7,
        filters: {
          leadId: options.leadId,
        },
      });

      if (notesResults.success && notesResults.data) {
        sources.push(...notesResults.data);
      }
    }

    // Sort by score and limit
    sources.sort((a, b) => b.score - a.score);
    const topSources = sources.slice(0, maxSources);

    if (topSources.length === 0) {
      return {
        success: true,
        data: {
          answer: "I don't have enough information to answer this question.",
          sources: [],
          confidence: 0,
        },
        meta: { processingTime: Date.now() - startTime },
      };
    }

    // Build context from sources
    const context = topSources
      .map((s, i) => `[Source ${i + 1}]: ${s.content}`)
      .join('\n\n');

    // Generate answer using Gemini
    const answerResult = await gemini.complete({
      prompt: `Answer the following question based on the provided context.
If the context doesn't contain enough information, say so.

Question: ${question}

Context:
${context}

Provide a clear, helpful answer:`,
    });

    if (!answerResult.success || !answerResult.data) {
      return {
        success: false,
        data: null,
        error: answerResult.error,
      };
    }

    // Calculate confidence based on source relevance
    const avgScore = topSources.reduce((sum, s) => sum + s.score, 0) / topSources.length;

    return {
      success: true,
      data: {
        answer: answerResult.data.content,
        sources: topSources,
        confidence: avgScore,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Question answering error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'QA_ERROR',
        message: error instanceof Error ? error.message : 'Question answering failed',
      },
    };
  }
}

/**
 * Get knowledge entry by ID
 */
export async function getEntry(id: string): Promise<CloudCoreResult<KnowledgeEntry | null>> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('knowledgebase')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null, meta: { processingTime: Date.now() - startTime } };
      }
      throw error;
    }

    const entry: KnowledgeEntry = {
      id: data.id,
      question: data.question_text,
      answer: data.answer_text,
      embeddings: data.embeddings,
      confidence: data.confidence_score,
      sourceLeadId: data.source_lead_id,
      createdAt: data.created_at,
      updatedAt: data.last_updated,
    };

    return {
      success: true,
      data: entry,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error getting knowledge entry:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GET_ENTRY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get entry',
      },
    };
  }
}

/**
 * Update knowledge entry
 */
export async function updateEntry(
  id: string,
  updates: Partial<Pick<KnowledgeEntry, 'question' | 'answer' | 'confidence'>>
): Promise<CloudCoreResult<KnowledgeEntry>> {
  const startTime = Date.now();

  try {
    const dbUpdates: Record<string, unknown> = {
      last_updated: new Date().toISOString(),
    };

    if (updates.question) {
      dbUpdates.question_text = updates.question;
    }
    if (updates.answer) {
      dbUpdates.answer_text = updates.answer;
    }
    if (updates.confidence !== undefined) {
      dbUpdates.confidence_score = updates.confidence;
    }

    // Regenerate embedding if content changed
    if (updates.question || updates.answer) {
      const entry = await getEntry(id);
      if (entry.success && entry.data) {
        const newQuestion = updates.question || entry.data.question;
        const newAnswer = updates.answer || entry.data.answer;

        const embeddingResult = await gemini.generateEmbedding(
          `${newQuestion} ${newAnswer}`
        );

        if (embeddingResult.success && embeddingResult.data) {
          dbUpdates.embeddings = embeddingResult.data.vector;
        }
      }
    }

    const { data, error } = await supabase
      .from('knowledgebase')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const entry: KnowledgeEntry = {
      id: data.id,
      question: data.question_text,
      answer: data.answer_text,
      embeddings: data.embeddings,
      confidence: data.confidence_score,
      sourceLeadId: data.source_lead_id,
      createdAt: data.created_at,
      updatedAt: data.last_updated,
    };

    return {
      success: true,
      data: entry,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UPDATE_ENTRY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update entry',
      },
    };
  }
}

/**
 * Delete knowledge entry
 */
export async function deleteEntry(id: string): Promise<CloudCoreResult<void>> {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('knowledgebase')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: null,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error deleting knowledge entry:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'DELETE_ENTRY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete entry',
      },
    };
  }
}

/**
 * Backfill embeddings for entries without them
 */
export async function backfillEmbeddings(
  limit: number = 100
): Promise<CloudCoreResult<{ processed: number; failed: number }>> {
  const startTime = Date.now();

  try {
    const { data: entries, error } = await supabase
      .from('knowledgebase')
      .select('id, question_text, answer_text')
      .is('embeddings', null)
      .limit(limit);

    if (error) {
      throw error;
    }

    if (!entries || entries.length === 0) {
      return {
        success: true,
        data: { processed: 0, failed: 0 },
        meta: { processingTime: Date.now() - startTime },
      };
    }

    let processed = 0;
    let failed = 0;

    for (const entry of entries) {
      const embeddingResult = await gemini.generateEmbedding(
        `${entry.question_text} ${entry.answer_text}`
      );

      if (embeddingResult.success && embeddingResult.data) {
        const { error: updateError } = await supabase
          .from('knowledgebase')
          .update({ embeddings: embeddingResult.data.vector })
          .eq('id', entry.id);

        if (updateError) {
          failed++;
        } else {
          processed++;
        }
      } else {
        failed++;
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

/**
 * Scrape a website and ingest content into knowledge base
 */
export interface ScrapeResult {
  pagesScraped: number;
  entriesCreated: number;
  errors: string[];
  entries: KnowledgeEntry[];
}

export async function scrapeWebsite(
  url: string,
  options?: ScrapeOptions & { category?: string; tags?: string[] }
): Promise<CloudCoreResult<ScrapeResult>> {
  const startTime = Date.now();
  const result: ScrapeResult = {
    pagesScraped: 0,
    entriesCreated: 0,
    errors: [],
    entries: [],
  };

  try {
    console.log(`[KnowledgeCurator] Starting website scrape: ${url}`);

    // Crawl the website
    const crawlResult = await scraper.crawlWebsite(url, options);

    if (!crawlResult.success || !crawlResult.data) {
      return {
        success: false,
        data: null,
        error: crawlResult.error || { code: 'CRAWL_ERROR', message: 'Failed to crawl website' },
      };
    }

    const pages = crawlResult.data;
    result.pagesScraped = pages.length;
    console.log(`[KnowledgeCurator] Scraped ${pages.length} pages`);

    // Ingest each page into knowledge base
    for (const page of pages) {
      try {
        // Skip pages with very little content
        if (page.content.length < 200) {
          console.log(`[KnowledgeCurator] Skipping ${page.url} - insufficient content`);
          continue;
        }

        // Truncate very long content
        const content = page.content.length > 10000
          ? page.content.slice(0, 10000) + '...'
          : page.content;

        const ingestResult = await ingest({
          content: `Page: ${page.title}\nURL: ${page.url}\n\n${content}`,
          title: page.title,
          category: options?.category || 'Website',
          tags: options?.tags || ['scraped', new URL(url).hostname],
        });

        if (ingestResult.success && ingestResult.data) {
          result.entriesCreated++;
          result.entries.push(ingestResult.data);
          console.log(`[KnowledgeCurator] Created entry for: ${page.title}`);
        } else {
          result.errors.push(`Failed to ingest ${page.url}: ${ingestResult.error?.message}`);
        }
      } catch (pageError) {
        result.errors.push(
          `Error processing ${page.url}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`
        );
      }
    }

    return {
      success: true,
      data: result,
      meta: {
        processingTime: Date.now() - startTime,
        pagesVisited: crawlResult.meta?.pagesVisited,
      },
    };
  } catch (error) {
    console.error('[KnowledgeCurator] Scrape error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SCRAPE_ERROR',
        message: error instanceof Error ? error.message : 'Website scraping failed',
      },
    };
  }
}

/**
 * Scrape a single URL and ingest
 */
export async function scrapeUrl(
  url: string,
  options?: { category?: string; tags?: string[] }
): Promise<CloudCoreResult<KnowledgeEntry>> {
  const startTime = Date.now();

  try {
    const result = await scraper.scrapeUrl(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        data: null,
        error: result.error || { code: 'SCRAPE_ERROR', message: 'Failed to scrape URL' },
      };
    }

    const page = result.data;

    if (page.content.length < 100) {
      return {
        success: false,
        data: null,
        error: { code: 'NO_CONTENT', message: 'Page has insufficient content' },
      };
    }

    // Truncate very long content
    const content = page.content.length > 10000
      ? page.content.slice(0, 10000) + '...'
      : page.content;

    const ingestResult = await ingest({
      content: `Page: ${page.title}\nURL: ${page.url}\n\n${content}`,
      title: page.title,
      category: options?.category || 'Website',
      tags: options?.tags || ['scraped', new URL(url).hostname],
    });

    if (!ingestResult.success) {
      return ingestResult;
    }

    return {
      success: true,
      data: ingestResult.data,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('[KnowledgeCurator] Single URL scrape error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SCRAPE_ERROR',
        message: error instanceof Error ? error.message : 'URL scraping failed',
      },
    };
  }
}

export default {
  ingest,
  search,
  searchKnowledge,
  searchNotes,
  answerQuestion,
  getEntry,
  updateEntry,
  deleteEntry,
  backfillEmbeddings,
  scrapeWebsite,
  scrapeUrl,
  KERNEL_CONFIG,
};
