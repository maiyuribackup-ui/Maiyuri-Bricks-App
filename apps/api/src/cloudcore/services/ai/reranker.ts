/**
 * Re-ranking Service
 * Uses a lightweight LLM (Gemini Flash) to score the relevance of retrieved documents
 * to the query, filtering out noise (`semantic but irrelevant`).
 */

import * as gemini from './gemini';
import { SemanticSearchResult, CloudCoreResult } from '../../types';

export interface RerankOptions {
  threshold?: number; // Minimum relevance score (0-1) to keep
  topK?: number;      // Number of top results to return
  model?: 'FLASH' | 'PRO';
}

/**
 * Re-rank search results by relevance to query
 */
export async function rerank(
  query: string,
  candidates: SemanticSearchResult[],
  options: RerankOptions = {}
): Promise<CloudCoreResult<SemanticSearchResult[]>> {
  const { threshold = 0.7, topK = 5, model = 'FLASH' } = options;

  if (candidates.length === 0) {
    return { success: true, data: [] };
  }

  try {
    // Construct the prompt for the LLM
    // We process in batch to save round-trips
    const candidatesText = candidates
    const prompt = `Task: Rate the relevance of snippet(s) to the query.
Query: "${query}"

Instructions:
1. Analyze the Semantic Intent of the query.
2. Handle "Tanglish" (Tamil+English) natively. 
   - Example: "rain-la" means "in rain" context.
   - Example: "weaken aaguma" implies durability/strength questions.
3. If the snippet contains the ANSWER to the intent, score it HIGH (>0.7).
4. Ignore keyword mismatches if the MEANING matches.

Snippets:
${candidatesText}

Output strict JSON only:
{ "0": 0.9, "1": 0.1 }`;

    const result = await gemini.complete({
      prompt,
      model,
      temperature: 0,
    });

    if (!result.success || !result.data) {
      // Fallback: return original candidates if re-ranking fails
      console.warn('Re-ranking failed, returning original candidates', result.error);
      return { success: true, data: candidates.slice(0, topK) };
    }

    // Parse scores
    let scores: Record<string, number> = {};
    try {
      const content = result.data.content;
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      let jsonStr = content;
      
      if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = content.substring(firstBrace, lastBrace + 1);
      } else {
          jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      }
      
      scores = JSON.parse(jsonStr);
    } catch {
       console.warn('Failed to parse re-ranking scores');
       return { success: true, data: candidates.slice(0, topK) };
    }

    // Assign scores and sort
    const scoredCandidates = candidates.map((c, i) => {
        // If LLM didn't score it (e.g. truncated output), fallback to original similarity similarity as base (normalized?)
        // Actually, just default to 0.5 or keep standard
        const llmScore = scores[i.toString()] ?? 0;
        return {
            ...c,
            relevanceScore: llmScore
        };
    });

    // Filter and Sort
    const filtered = scoredCandidates
        .filter(c => c.relevanceScore >= threshold)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // If we filtered too aggressively (0 results), maybe fallback to top 1-2 original?
    // For now, respect the strict threshold to avoid hallucinations.
    
    return {
        success: true,
        data: filtered.slice(0, topK)
    };

  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        code: 'RERANK_ERROR',
        message: error instanceof Error ? error.message : 'Re-ranking failed'
      }
    };
  }
}

export default {
    rerank
};
