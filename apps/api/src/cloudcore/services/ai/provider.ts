/**
 * AI Provider Factory
 * Unified interface for AI operations with proper routing
 *
 * Routing Rules:
 * - Claude: Reasoning, analysis, scoring, suggestions, coaching
 * - Gemini: STT, embeddings, multimodal processing, summarization of transcripts
 */

import * as claude from './claude';
import * as gemini from './gemini';
import type { CloudCoreResult } from '../../types';

export type AITaskType =
  | 'reasoning' // Claude
  | 'analysis' // Claude
  | 'scoring' // Claude
  | 'suggestions' // Claude
  | 'coaching' // Claude
  | 'transcription' // Gemini
  | 'embedding' // Gemini
  | 'summarization' // Gemini (for transcripts)
  | 'multimodal'; // Gemini

export interface AITaskRequest {
  type: AITaskType;
  input: Record<string, unknown>;
  options?: Record<string, unknown>;
}

/**
 * Get the appropriate AI provider for a task type
 */
export function getProviderForTask(taskType: AITaskType): 'claude' | 'gemini' {
  switch (taskType) {
    case 'reasoning':
    case 'analysis':
    case 'scoring':
    case 'suggestions':
    case 'coaching':
      return 'claude';

    case 'transcription':
    case 'embedding':
    case 'summarization':
    case 'multimodal':
      return 'gemini';

    default:
      return 'claude'; // Default to Claude for unknown tasks
  }
}

/**
 * Execute an AI task with automatic provider routing
 */
export async function executeTask<T>(
  request: AITaskRequest
): Promise<CloudCoreResult<T>> {
  const provider = getProviderForTask(request.type);

  switch (request.type) {
    case 'reasoning':
    case 'analysis':
      return claude.completeJson<T>({
        systemPrompt: request.input.systemPrompt as string,
        userPrompt: request.input.userPrompt as string,
        maxTokens: (request.options?.maxTokens as number) || 1024,
        temperature: (request.options?.temperature as number) || 0.7,
      });

    case 'scoring':
      return claude.generateScore(
        request.input.leadContext as string,
        request.input.notesContext as string,
        request.input.metrics as Record<string, number>
      ) as Promise<CloudCoreResult<T>>;

    case 'suggestions':
      return claude.generateSuggestions(
        request.input.leadContext as string,
        request.input.notesContext as string
      ) as Promise<CloudCoreResult<T>>;

    case 'coaching':
      return claude.generateCoachingInsights(
        request.input.staffContext as string,
        request.input.metricsContext as string,
        request.input.period as string
      ) as Promise<CloudCoreResult<T>>;

    case 'transcription':
      if (request.input.base64) {
        return gemini.transcribeAudioFromBase64(
          request.input.base64 as string,
          request.input.mimeType as string,
          request.options as gemini.TranscriptionOptions
        ) as Promise<CloudCoreResult<T>>;
      }
      return gemini.transcribeAudio(
        request.input.audioUrl as string,
        request.input.mimeType as string,
        request.options as gemini.TranscriptionOptions
      ) as Promise<CloudCoreResult<T>>;

    case 'embedding':
      if (Array.isArray(request.input.texts)) {
        return gemini.generateEmbeddings(
          request.input.texts as string[]
        ) as Promise<CloudCoreResult<T>>;
      }
      return gemini.generateEmbedding(
        request.input.text as string
      ) as Promise<CloudCoreResult<T>>;

    case 'summarization':
      return gemini.summarizeTranscription(
        request.input.text as string
      ) as Promise<CloudCoreResult<T>>;

    case 'multimodal':
      return gemini.complete({
        prompt: request.input.prompt as string,
        parts: request.input.parts as gemini.GeminiCompletionRequest['parts'],
        maxTokens: (request.options?.maxTokens as number) || 1024,
        temperature: (request.options?.temperature as number) || 0.7,
      }) as Promise<CloudCoreResult<T>>;

    default:
      return {
        success: false,
        data: null,
        error: {
          code: 'UNKNOWN_TASK_TYPE',
          message: `Unknown AI task type: ${request.type}`,
        },
      };
  }
}

/**
 * Check if AI services are available
 */
export async function checkHealth(): Promise<{
  claude: boolean;
  gemini: boolean;
}> {
  const results = {
    claude: false,
    gemini: false,
  };

  try {
    // Test Claude
    const claudeResult = await claude.complete({
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Say "OK" to confirm you are working.',
      maxTokens: 10,
    });
    results.claude = claudeResult.success;
  } catch {
    results.claude = false;
  }

  try {
    // Test Gemini
    const geminiResult = await gemini.complete({
      prompt: 'Say "OK" to confirm you are working.',
    });
    results.gemini = geminiResult.success;
  } catch {
    results.gemini = false;
  }

  return results;
}

export default {
  getProviderForTask,
  executeTask,
  checkHealth,
  claude,
  gemini,
};
