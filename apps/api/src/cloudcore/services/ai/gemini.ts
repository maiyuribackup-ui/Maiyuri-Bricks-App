/**
 * Gemini Service
 * Used for STT (Speech-to-Text), embeddings, and multimodal processing
 * Model: gemini-2.5-flash-preview-05-20
 */

import { GoogleGenerativeAI, Part, TaskType } from '@google/generative-ai';
import { GoogleGenAI as GeminiClient } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GeminiModels, type CloudCoreResult, type TokenUsage } from '../../types';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// Default configuration
const DEFAULT_MODEL = GeminiModels.FLASH;
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

export interface GeminiCompletionRequest {
  prompt: string;
  model?: keyof typeof GeminiModels;
  maxTokens?: number;
  temperature?: number;
  parts?: Part[];
}

export interface GeminiCompletionResponse {
  content: string;
  usage?: TokenUsage;
}

export interface TranscriptionOptions {
  language?: 'en' | 'ta' | 'auto';
  includeTimestamps?: boolean;
  speakerDiarization?: boolean;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration?: number;
  speakers?: string[];
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  model: string;
}

/**
 * Generate a completion using Gemini
 */
export async function complete(
  request: GeminiCompletionRequest
): Promise<CloudCoreResult<GeminiCompletionResponse>> {
  const startTime = Date.now();

  try {
    const modelName = request.model ? GeminiModels[request.model] : DEFAULT_MODEL;
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 2048,
        temperature: request.temperature ?? 0.7,
      },
    });

    let result;
    if (request.parts && request.parts.length > 0) {
      result = await model.generateContent([...request.parts, { text: request.prompt }]);
    } else {
      result = await model.generateContent(request.prompt);
    }

    const content = result.response.text();

    return {
      success: true,
      data: {
        content,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Gemini completion error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'GEMINI_COMPLETION_ERROR',
        message: error instanceof Error ? error.message : 'Gemini completion failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate a JSON completion using Gemini (Adapter for Fallback)
 */
export async function completeJson<T>(
  request: { systemPrompt: string; userPrompt: string; maxTokens?: number; temperature?: number }
): Promise<CloudCoreResult<T>> {
  // Merge system and user prompt as Flash typically performs better with single context block for instructions
  const mergedPrompt = `${request.systemPrompt}

IMPORTANT: Respond ONLY with valid JSON. No other text or explanation.

${request.userPrompt}`;

  // Override maxTokens to prevent truncation (Gemini usage is cheap, better safe than truncated)
  const SAFE_MAX_TOKENS = 8192;

  const result = await complete({
    prompt: mergedPrompt,
    maxTokens: SAFE_MAX_TOKENS, // Ignore request.maxTokens
    temperature: request.temperature,
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error,
      meta: result.meta,
    };
  }

  try {
    const content = result.data.content.trim();
    let jsonStr = content;

    // Robust JSON extraction using Regex
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    } else {
        // Fallback: try to find first { or [ and last } or ]
        const firstParen = content.search(/[{[]/);
        const lastParen = content.lastIndexOf(content.includes(']') && content.includes('}') ? (content.lastIndexOf(']') > content.lastIndexOf('}') ? ']' : '}') : (content.includes(']') ? ']' : '}'));
        
        if (firstParen !== -1 && lastParen !== -1 && lastParen > firstParen) {
            jsonStr = content.substring(firstParen, lastParen + 1);
        }
    }

    const parsed = JSON.parse(jsonStr) as T;
    return {
      success: true,
      data: parsed,
      meta: result.meta,
    };
  } catch (parseError) {
    console.error('JSON parse error (Gemini):', parseError);
    return {
      success: false,
      data: null,
      error: {
        code: 'JSON_PARSE_ERROR',
        message: 'Failed to parse Gemini response as JSON',
        details: { rawContent: result.data.content },
      },
      meta: result.meta,
    };
  }
}

/**
 * Transcribe audio using Gemini
 * Supports Tamil-first with English fallback
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string = 'audio/mpeg',
  options: TranscriptionOptions = {}
): Promise<CloudCoreResult<TranscriptionResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: GeminiModels.FLASH });

    // Fetch the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    // Create audio part
    const audioPart: Part = {
      inlineData: {
        mimeType,
        data: base64Audio,
      },
    };

    // Build language instruction
    let languageInstruction = '';
    if (options.language === 'ta') {
      languageInstruction = 'The audio is primarily in Tamil. Transcribe in Tamil script when applicable.';
    } else if (options.language === 'en') {
      languageInstruction = 'The audio is in English.';
    } else {
      languageInstruction = 'The audio may be in Tamil, English, or mixed. Preserve the original language.';
    }

    const prompt = `You are a highly accurate transcription assistant.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. ${options.speakerDiarization ? 'Distinguish between different speakers with [Speaker 1], [Speaker 2], etc.' : ''}
4. Include relevant non-speech sounds in [brackets] if important
5. Mark unclear words with [unclear]
6. ${languageInstruction}
${options.includeTimestamps ? '7. Include timestamps in [MM:SS] format at the start of each paragraph' : ''}

Return ONLY the transcription text, no explanations.`;

    const result = await model.generateContent([audioPart, { text: prompt }]);
    const transcriptionText = result.response.text().trim();

    // Estimate confidence
    const hasUnclearMarkers = /\[unclear\]/i.test(transcriptionText);
    const confidence = hasUnclearMarkers ? 0.75 : 0.95;

    // Detect language
    const language = detectLanguage(transcriptionText);

    // Estimate duration (rough approximation based on word count)
    const wordCount = transcriptionText.split(/\s+/).length;
    const estimatedDuration = Math.round(wordCount / 2.5); // ~150 words per minute

    return {
      success: true,
      data: {
        text: transcriptionText,
        confidence,
        language,
        duration: estimatedDuration,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'TRANSCRIPTION_ERROR',
        message: error instanceof Error ? error.message : 'Transcription failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Transcribe audio from base64 data
 */
export async function transcribeAudioFromBase64(
  base64Data: string,
  mimeType: string = 'audio/mpeg',
  options: TranscriptionOptions = {}
): Promise<CloudCoreResult<TranscriptionResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: GeminiModels.FLASH });

    const audioPart: Part = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    // Build language instruction
    let languageInstruction = '';
    if (options.language === 'ta') {
      languageInstruction = 'The audio is primarily in Tamil. Transcribe in Tamil script when applicable.';
    } else if (options.language === 'en') {
      languageInstruction = 'The audio is in English.';
    } else {
      languageInstruction = 'The audio may be in Tamil, English, or mixed. Preserve the original language.';
    }

    const prompt = `You are a highly accurate transcription assistant.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. Mark unclear words with [unclear]
4. ${languageInstruction}

Return ONLY the transcription text, no explanations.`;

    const result = await model.generateContent([audioPart, { text: prompt }]);
    const transcriptionText = result.response.text().trim();

    const hasUnclearMarkers = /\[unclear\]/i.test(transcriptionText);
    const confidence = hasUnclearMarkers ? 0.75 : 0.95;
    const language = detectLanguage(transcriptionText);

    return {
      success: true,
      data: {
        text: transcriptionText,
        confidence,
        language,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'TRANSCRIPTION_ERROR',
        message: error instanceof Error ? error.message : 'Transcription failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate text embeddings using Gemini
 */
export async function generateEmbedding(
  text: string,
  options?: { taskType?: string; title?: string }
): Promise<CloudCoreResult<EmbeddingResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text }] },
      taskType: options?.taskType as TaskType,
      title: options?.title,
    });

    const embedding = result.embedding;
    if (!embedding || !embedding.values) {
      throw new Error('No embedding returned');
    }

    return {
      success: true,
      data: {
        vector: embedding.values,
        dimensions: embedding.values.length,
        model: EMBEDDING_MODEL,
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Embedding error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'EMBEDDING_ERROR',
        message: error instanceof Error ? error.message : 'Embedding generation failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<CloudCoreResult<EmbeddingResult[]>> {
  const startTime = Date.now();

  try {
    const results = await Promise.all(texts.map((text) => generateEmbedding(text)));

    const embeddings: EmbeddingResult[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.success && result.data) {
        embeddings.push(result.data);
      } else {
        errors.push(result.error?.message || 'Unknown error');
      }
    }

    if (embeddings.length === 0) {
      return {
        success: false,
        data: null,
        error: {
          code: 'BATCH_EMBEDDING_ERROR',
          message: 'All embeddings failed',
          details: { errors },
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: embeddings,
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('Batch embedding error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'BATCH_EMBEDDING_ERROR',
        message: error instanceof Error ? error.message : 'Batch embedding failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Summarize transcribed text using Gemini
 */
export async function summarizeTranscription(
  text: string
): Promise<CloudCoreResult<{ summary: string; highlights: string[] }>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: GeminiModels.FLASH });

    const result = await model.generateContent([
      {
        text: `Summarize the following conversation/note in 2-3 concise bullet points:

Text to summarize:
${text}

Focus on:
- Key topics discussed
- Action items or decisions
- Important dates, numbers, or commitments

Return a JSON object:
{
  "summary": "2-3 sentence summary",
  "highlights": ["Key point 1", "Key point 2", "Key point 3"]
}`,
      },
    ]);

    const responseText = result.response.text().trim();

    // Try to parse as JSON
    try {
      let jsonStr = responseText;
      if (responseText.startsWith('```json')) {
        jsonStr = responseText.slice(7, responseText.lastIndexOf('```')).trim();
      } else if (responseText.startsWith('```')) {
        jsonStr = responseText.slice(3, responseText.lastIndexOf('```')).trim();
      }

      const parsed = JSON.parse(jsonStr);
      return {
        success: true,
        data: {
          summary: parsed.summary || responseText,
          highlights: parsed.highlights || [],
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    } catch {
      // If parsing fails, return raw text as summary
      return {
        success: true,
        data: {
          summary: responseText,
          highlights: [],
        },
        meta: {
          processingTime: Date.now() - startTime,
        },
      };
    }
  } catch (error) {
    console.error('Summarization error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SUMMARIZATION_ERROR',
        message: error instanceof Error ? error.message : 'Summarization failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Detect language from text
 */
function detectLanguage(text: string): string {
  // Tamil Unicode range: U+0B80 to U+0BFF
  const tamilPattern = /[\u0B80-\u0BFF]/;
  const hasTamil = tamilPattern.test(text);

  // Check for English words
  const englishWordPattern = /[a-zA-Z]+/g;
  const englishWords = text.match(englishWordPattern) || [];

  if (hasTamil && englishWords.length > 5) {
    return 'mixed'; // Tamil + English
  } else if (hasTamil) {
    return 'ta'; // Tamil
  } else {
    return 'en'; // English
  }
}

// --- RAG / File Search Implementation ---

/**
 * Add content to Knowledge Base
 * With Context Stuffing approach, this is a pass-through since actual storage is in Supabase
 * Kept for API compatibility with knowledge-curator
 */
export async function addToKnowledgeBase(
  title: string,
  content: string,
  metadata?: Record<string, any>
): Promise<CloudCoreResult<{ fileId: string; uri: string }>> {
  const startTime = Date.now();

  // With context stuffing, we don't upload to external File Search store
  // Storage is handled by knowledge-curator directly in Supabase
  // This function exists for API compatibility and future extensibility
  
  console.log(`[Context Stuffing] Knowledge entry prepared: "${title}" (${content.length} chars)`);

  return {
    success: true,
    data: {
      fileId: 'local-supabase',
      uri: `supabase://knowledgebase/${Date.now()}`
    },
    meta: {
      processingTime: Date.now() - startTime,
      provider: 'context_stuffing'
    }
  };
}

/**
 * Query the Knowledge Base using Context Stuffing (RAG)
 * Fetches all documents from Supabase and embeds them in the system instruction
 */
export async function queryKnowledgeBase(
  query: string,
  options?: { language?: 'en' | 'ta' }
): Promise<CloudCoreResult<{ answer: string; citations: string[] }>> {
  const language = options?.language || 'en';
  const startTime = Date.now();

  try {
    // 1. Fetch all knowledge entries from Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: documents, error: fetchError } = await supabase
      .from('knowledgebase')
      .select('id, question_text, answer_text, metadata')
      .order('created_at', { ascending: false })
      .limit(50); // Limit to recent 50 docs to stay within context window
    
    if (fetchError) {
      throw new Error(`Failed to fetch knowledge: ${fetchError.message}`);
    }

    if (!documents || documents.length === 0) {
      return {
        success: true,
        data: {
          answer: 'The knowledge base is empty. Please add some documents first.',
          citations: []
        },
        meta: { processingTime: Date.now() - startTime }
      };
    }

    // 2. Build context block from documents
    const contextBlock = documents.map((doc: any) => `
<DOCUMENT>
  <TITLE>${doc.question_text || 'Untitled'}</TITLE>
  <CONTENT>
${doc.answer_text || ''}
  </CONTENT>
</DOCUMENT>
`).join('\n');

    // 3. Create system instruction with RAG rules
    const languageInstruction = language === 'ta'
      ? '\n\nIMPORTANT: Respond entirely in Tamil (தமிழ்). All text must be in Tamil script.'
      : '';

    const systemInstruction = `
You are a highly intelligent Knowledge Base Assistant for Maiyuri Bricks.
Your goal is to answer the user's questions strictly based on the provided <DOCUMENT> blocks.

RULES:
1. Use ONLY the information in the provided documents to answer.
2. If the answer is not in the documents, say "I cannot find information regarding this in the knowledge base."
3. Cite the document title when you reference specific facts (e.g., [Document Title]).
4. Be concise and professional.
5. You can use markdown for formatting tables, lists, and code.${languageInstruction}

CONTEXT LIBRARY:
${contextBlock}
`;

    // 4. Generate response using Gemini with thinking mode
    const geminiClient = new GeminiClient({ apiKey: process.env.GOOGLE_AI_API_KEY });
    
    const result = await geminiClient.models.generateContent({
      model: 'gemini-2.5-pro', // P2: Use pro model for better reasoning
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, // P1: Low temperature for factual responses
        thinkingConfig: { 
          thinkingBudget: 2048 // P1: Enable thinking for better retrieval/reasoning
        },
      },
      contents: [{ role: 'user', parts: [{ text: query }] }]
    });

    const responseText = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 5. Extract cited document titles from the response
    const citations: string[] = [];
    const citationRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = citationRegex.exec(responseText)) !== null) {
      if (!citations.includes(match[1])) {
        citations.push(match[1]);
      }
    }

    return {
      success: true,
      data: {
        answer: responseText,
        citations
      },
      meta: { processingTime: Date.now() - startTime }
    };

  } catch (error) {
    console.error('Knowledge Base Query Error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'RAG_QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Query failed'
      },
      meta: { processingTime: Date.now() - startTime }
    };
  }
}


export default {
  complete,
  completeJson,
  transcribeAudio,
  transcribeAudioFromBase64,
  generateEmbedding,
  generateEmbeddings,
  summarizeTranscription,
  addToKnowledgeBase,
  queryKnowledgeBase,
};
