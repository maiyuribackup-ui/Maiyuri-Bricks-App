/**
 * Chunking Service
 * Splits larger texts (especially transcripts) into semantic chunks
 * and extracts metadata using AI.
 */

import * as gemini from './gemini';
import { CloudCoreResult } from '../../types';

export interface Chunk {
  text: string;
  index: number;
  metadata: {
    topics?: string[];
    sentiment?: 'positive' | 'negative' | 'neutral';
    speakers?: string[];
    startTime?: string;
  };
}

export interface ChunkingOptions {
  maxChunkSize?: number; // approx characters
  overlap?: number; // lines overlap
  strategy?: 'transcript' | 'paragraph';
}

/**
 * Split text into chunks
 */
export async function chunkText(
  text: string,
  options: ChunkingOptions = {}
): Promise<Chunk[]> {
  const { strategy = 'paragraph', maxChunkSize = 1000 } = options;

  if (strategy === 'transcript') {
    return chunkTranscript(text, maxChunkSize);
  }

  return chunkParagraphs(text, maxChunkSize);
}

/**
 * Specialized chunker for transcripts with [Speaker] or [Time] markers
 */
function chunkTranscript(text: string, maxSize: number): Chunk[] {
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  let currentChunkText = '';
  let currentSpeakers = new Set<string>();
  let currentStartTime: string | undefined;
  let chunkIndex = 0;

  // Regex to detect speaker markers like [Speaker 1] or identifiers like "Ram:"
  const speakerRegex = /^\[?(Speaker \d+|[A-Za-z]+):?\]?/;
  // Regex for timestamps like [00:12]
  const timeRegex = /\[(\d{2}:\d{2})\]/;

  for (const line of lines) {
    // Check if adding this line exceeds max size AND we have enough content
    if (currentChunkText.length + line.length > maxSize && currentChunkText.length > 100) {
      chunks.push({
        text: currentChunkText.trim(),
        index: chunkIndex++,
        metadata: {
          speakers: Array.from(currentSpeakers),
          startTime: currentStartTime,
        },
      });
      // Reset for next chunk
      currentChunkText = '';
      // Keep speakers if they are still potentially active? 
      // Actually usually better to reset speakers for the new chunk context
      currentSpeakers = new Set<string>(); 
      // Don't reset startTime if this is a continuation, but usually we want the NEW start time
      currentStartTime = undefined;
    }

    // Capture metadata from line
    const speakerMatch = line.match(speakerRegex);
    if (speakerMatch) {
      currentSpeakers.add(speakerMatch[1] || speakerMatch[0]);
    }

    const timeMatch = line.match(timeRegex);
    if (timeMatch && !currentStartTime) {
      // Only capture the first timestamp found in the chunk
      currentStartTime = timeMatch[1];
    }

    currentChunkText += line + '\n';
  }

  // Add remaining text
  if (currentChunkText.trim().length > 0) {
    chunks.push({
      text: currentChunkText.trim(),
      index: chunkIndex++,
      metadata: {
        speakers: Array.from(currentSpeakers),
        startTime: currentStartTime,
      },
    });
  }

  return chunks;
}

/**
 * Simple paragraph-based chunker
 */
function chunkParagraphs(text: string, maxSize: number): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (para.trim().length === 0) continue;
    
    // If paragraph is huge, split sentences (naive)
    if (para.length > maxSize) {
      // TODO: Improve long paragraph splitting
      chunks.push({
        text: para.slice(0, maxSize) + '...',
        index: chunkIndex++,
        metadata: {},
      });
    } else {
      chunks.push({
        text: para.trim(),
        index: chunkIndex++,
        metadata: {},
      });
    }
  }

  return chunks;
}

/**
 * Enrich chunks with AI-extracted metadata
 * Uses Gemini Flash for speed/cost
 */
export async function enrichChunks(
  chunks: Chunk[]
): Promise<CloudCoreResult<Chunk[]>> {
  try {
    const enrichedChunks = await Promise.all(
      chunks.map(async (chunk) => {
        const prompt = `Analyze this transcript segment and extract metadata (JSON).
        
Text: "${chunk.text.slice(0, 1000)}"

Return JSON only:
{
  "topics": ["topic1", "topic2"],
  "sentiment": "positive" | "negative" | "neutral",
  "intent": "question" | "statement" | "objection" | "closing"
}`;

        const result = await gemini.complete({
            prompt,
            model: 'FLASH', // Explicitly use Flash
            temperature: 0.1
        });

        if (result.success && result.data) {
           try {
             const jsonStr = result.data.content.replace(/```json/g, '').replace(/```/g, '').trim();
             const meta = JSON.parse(jsonStr);
             return {
               ...chunk,
               metadata: {
                 ...chunk.metadata,
                 ...meta
               }
             };
           } catch (e) {
             console.warn('Failed to parse metadata JSON', e);
             return chunk;
           }
        }
        return chunk;
      })
    );

    return {
      success: true,
      data: enrichedChunks,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        code: 'ENRICH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to enrich chunks',
      },
    };
  }
}

export default {
    chunkText,
    enrichChunks
};
