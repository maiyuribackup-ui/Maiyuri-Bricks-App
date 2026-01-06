/**
 * Gemini Service
 * Used for STT (Speech-to-Text), embeddings, and multimodal processing
 * Model: gemini-2.5-flash-preview-05-20
 */

import { GoogleGenerativeAI, Part } from '@google/generative-ai';
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

    // Robust JSON extraction: Find first '{' and last '}'
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = content.substring(firstBrace, lastBrace + 1);
    } else {
      // Fallback to code block stripping if braces process fails
      if (content.startsWith('```json')) {
        jsonStr = content.slice(7, content.lastIndexOf('```')).trim();
      } else if (content.startsWith('```')) {
        jsonStr = content.slice(3, content.lastIndexOf('```')).trim();
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
  text: string
): Promise<CloudCoreResult<EmbeddingResult>> {
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);

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

export default {
  complete,
  transcribeAudio,
  transcribeAudioFromBase64,
  generateEmbedding,
  generateEmbeddings,
  summarizeTranscription,
};
