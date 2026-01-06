
/**
 * OpenAI Service (Fallback)
 * Used as a tertiary fallback when Claude and Gemini fail
 * Model: gpt-4o
 */

import OpenAI from 'openai';
import type { CloudCoreResult, TokenUsage } from '../../types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;

export interface OpenAICompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface OpenAICompletionResponse {
  content: string;
  usage: TokenUsage;
}

/**
 * Generate a completion using OpenAI
 */
export async function complete(
  request: OpenAICompletionRequest
): Promise<CloudCoreResult<OpenAICompletionResponse>> {
  const startTime = Date.now();

  try {
    const model = request.model || DEFAULT_MODEL;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? DEFAULT_TEMPERATURE,
      response_format: request.jsonMode ? { type: 'json_object' } : undefined,
    });

    const content = response.choices[0]?.message?.content || '';
    const usage: TokenUsage = {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      model,
    };

    return {
      success: true,
      data: {
        content,
        usage,
      },
      meta: {
        processingTime: Date.now() - startTime,
        usage,
      },
    };
  } catch (error) {
    console.error('OpenAI completion error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'OPENAI_COMPLETION_ERROR',
        message: error instanceof Error ? error.message : 'OpenAI completion failed',
      },
      meta: { processingTime: Date.now() - startTime },
    };
  }
}

/**
 * Generate a JSON completion using OpenAI
 */
export async function completeJson<T>(
  request: Omit<OpenAICompletionRequest, 'jsonMode'>
): Promise<CloudCoreResult<T>> {
  // Ensure system prompt explicitly asks for JSON to satisfy OpenAI's requirements
  const jsonSystemPrompt = request.systemPrompt + '\n\nIMPORTANT: Return valid JSON only.';
  
  const result = await complete({ 
    ...request, 
    systemPrompt: jsonSystemPrompt,
    jsonMode: true 
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
    const parsed = JSON.parse(result.data.content) as T;
    return {
      success: true,
      data: parsed,
      meta: result.meta,
    };
  } catch (parseError) {
    console.error('JSON parse error (OpenAI):', parseError);
    return {
      success: false,
      data: null,
      error: {
        code: 'JSON_PARSE_ERROR',
        message: 'Failed to parse OpenAI response as JSON',
        details: { rawContent: result.data.content },
      },
      meta: result.meta,
    };
  }
}

export default {
    complete,
    completeJson
};
