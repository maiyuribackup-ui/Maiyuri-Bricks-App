/**
 * Claude Service
 * Used for reasoning, analysis, scoring, and decision support
 * Model: claude-sonnet-4-20250514
 */

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeModels, type TokenUsage, type CloudCoreResult } from '../../types';

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Default configuration
const DEFAULT_MODEL = ClaudeModels.SONNET;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;

export interface ClaudeCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: keyof typeof ClaudeModels;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ClaudeCompletionResponse {
  content: string;
  usage: TokenUsage;
  stopReason: string;
}

/**
 * Generate a completion using Claude
 */
export async function complete(
  request: ClaudeCompletionRequest
): Promise<CloudCoreResult<ClaudeCompletionResponse>> {
  const startTime = Date.now();

  try {
    const model = request.model ? ClaudeModels[request.model] : DEFAULT_MODEL;
    const maxTokens = request.maxTokens || DEFAULT_MAX_TOKENS;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;

    // Add JSON instruction if jsonMode is enabled
    let systemPrompt = request.systemPrompt;
    if (request.jsonMode) {
      systemPrompt += '\n\nIMPORTANT: Respond ONLY with valid JSON. No other text or explanation.';
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      model,
    };

    return {
      success: true,
      data: {
        content,
        usage,
        stopReason: response.stop_reason || 'unknown',
      },
      meta: {
        processingTime: Date.now() - startTime,
        usage,
      },
    };
  } catch (error) {
    console.error('Claude completion error:', error);
    console.warn('Claude API failed, attempting fallback...', error instanceof Error ? error.message : error);

    // Fallback to Gemini
    console.log('🔄 Swapping to Fallback: Gemini');
    try {
      const geminiResult = await gemini.complete({
        prompt: `${request.systemPrompt}\n\n${request.userPrompt}`,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });

      if (geminiResult.success && geminiResult.data) {
        return {
          success: true,
          data: {
            content: geminiResult.data.content,
            usage: geminiResult.data.usage || {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              model: 'gemini-fallback',
            },
            stopReason: 'stop',
          },
          meta: {
            processingTime: Date.now() - startTime,
            provider: 'gemini(fallback)',
          },
        };
      }
      console.warn('Gemini fallback also failed:', geminiResult.error);
    } catch (geminiError) {
      console.error('Gemini fallback error:', geminiError);
    }

    // Return original error if Gemini also fails
    return {
      success: false,
      data: null,
      error: {
        code: 'CLAUDE_COMPLETION_ERROR',
        message: error instanceof Error ? error.message : 'Claude completion failed',
      },
      meta: {
        processingTime: Date.now() - startTime,
      },
    };
  }
}

// Import fallback providers
import * as gemini from './gemini';
import * as openai from './openai';

/**
 * Generate a JSON completion using Claude with Fallback Support
 * Chain: Claude -> Gemini -> OpenAI
 */
export async function completeJson<T>(
  request: Omit<ClaudeCompletionRequest, 'jsonMode'>
): Promise<CloudCoreResult<T>> {
  // 1. Try Claude (Primary)
  const result = await complete({ ...request, jsonMode: true });

  if (result.success && result.data) {
    try {
      // Try to extract JSON from the response
      const content = result.data.content.trim();
      let jsonStr = content;

      if (content.startsWith('```json')) {
        jsonStr = content.slice(7, content.lastIndexOf('```')).trim();
      } else if (content.startsWith('```')) {
        jsonStr = content.slice(3, content.lastIndexOf('```')).trim();
      }

      const parsed = JSON.parse(jsonStr) as T;
      return { success: true, data: parsed, meta: result.meta };
    } catch (parseError) {
      console.warn('Claude JSON parse error, attempting fallback...', parseError);
      // Proceed to fallback if parsing fails
    }
  } else {
    console.warn('Claude API failed, attempting fallback...', result.error);
  }

  // 2. Try Gemini (Fallback 1)
  console.log('🔄 Swapping to Fallback: Gemini');
  const geminiResult = await gemini.completeJson<T>({
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  });

  if (geminiResult.success && geminiResult.data) {
    return {
      success: true,
      data: geminiResult.data,
      meta: { 
        processingTime: geminiResult.meta?.processingTime || 0,
        provider: 'gemini(fallback)',
        usage: geminiResult.meta?.usage
      },
    };
  }
  console.warn('Gemini fallback failed, attempting secondary fallback...', geminiResult.error);

  // 3. Try OpenAI (Fallback 2)
  console.log('🔄 Swapping to Secondary Fallback: OpenAI');
  const openaiResult = await openai.completeJson<T>({
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  });

  if (openaiResult.success && openaiResult.data) {
    return {
      success: true,
      data: openaiResult.data,
      meta: { 
        processingTime: openaiResult.meta?.processingTime || 0,
        provider: 'openai(fallback)',
        usage: openaiResult.meta?.usage
      },
    };
  }

  // All providers failed
  return {
    success: false,
    data: null,
    error: {
      code: 'ALL_PROVIDERS_FAILED',
      message: 'Claude, Gemini, and OpenAI all failed to complete the request.',
      details: {
        claudeError: result.error,
        geminiError: geminiResult.error,
        openaiError: openaiResult.error,
      },
    },
  };
}

/**
 * Analyze lead data using Claude
 */
export async function analyzeLead(
  leadContext: string,
  notesContext: string,
  analysisType: string
): Promise<CloudCoreResult<Record<string, unknown>>> {
  const systemPrompt = `You are an expert sales analyst for a brick manufacturing business.
Your role is to analyze lead information and provide actionable insights.

Analysis Guidelines:
- Be concise but thorough
- Focus on conversion probability factors
- Identify key action items
- Consider the construction industry context
- Account for regional (Tamil Nadu, India) business practices`;

  const userPrompt = `Perform a ${analysisType} analysis on this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

Provide your analysis in the following JSON format:
{
  "summary": "Brief overview of the lead",
  "highlights": ["Key point 1", "Key point 2"],
  "actionItems": ["Action 1", "Action 2"],
  "conversionProbability": 0.75,
  "recommendedNextAction": "Specific action to take",
  "urgency": "high|medium|low"
}`;

  return completeJson<Record<string, unknown>>({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.5,
  });
}

/**
 * Generate scoring analysis using Claude
 */
export async function generateScore(
  leadContext: string,
  notesContext: string,
  metrics: Record<string, number>
): Promise<CloudCoreResult<{
  score: number;
  confidence: number;
  factors: Array<{ factor: string; impact: string; weight: number }>;
  recommendation: string;
}>> {
  const systemPrompt = `You are a lead scoring expert for a brick manufacturing business.
Calculate conversion probability based on lead data and interaction history.

Scoring Factors:
- Engagement level (interaction frequency)
- Expressed urgency/timeline
- Budget indicators
- Decision-maker status
- Project specifics (size, type)
- Response timeliness
- Sentiment in notes`;

  const userPrompt = `Score this lead's conversion probability:

LEAD INFORMATION:
${leadContext}

METRICS:
${Object.entries(metrics)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "score": 0.75,
  "confidence": 0.85,
  "factors": [
    {"factor": "Description", "impact": "positive|negative|neutral", "weight": 0.2}
  ],
  "recommendation": "Specific recommendation"
}`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.3, // Lower temperature for more consistent scoring
  });
}

/**
 * Generate suggestions using Claude
 */
export async function generateSuggestions(
  leadContext: string,
  notesContext: string
): Promise<CloudCoreResult<{
  suggestions: Array<{
    id: string;
    type: string;
    content: string;
    priority: string;
    reasoning: string;
  }>;
  nextBestAction: string;
  suggestedFollowUpDate: string;
}>> {
  const systemPrompt = `You are a sales advisor for a brick manufacturing business.
Generate actionable suggestions to help close leads.

Suggestion Types:
- action: Tasks to complete
- response: What to say to the lead
- insight: Observations about the lead
- warning: Potential issues to address`;

  const userPrompt = `Generate suggestions for this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "suggestions": [
    {
      "id": "uuid",
      "type": "action|response|insight|warning",
      "content": "Suggestion text",
      "priority": "high|medium|low",
      "reasoning": "Why this suggestion"
    }
  ],
  "nextBestAction": "Single most important action",
  "suggestedFollowUpDate": "YYYY-MM-DD"
}`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    temperature: 0.7,
  });
}

/**
 * Generate coaching insights using Claude
 */
export async function generateCoachingInsights(
  staffContext: string,
  metricsContext: string,
  period: string
): Promise<CloudCoreResult<{
  insights: Array<{
    type: string;
    title: string;
    description: string;
    metric?: string;
    value?: number;
  }>;
  recommendations: Array<{
    priority: string;
    area: string;
    action: string;
    expectedImpact: string;
  }>;
  overallScore: number;
}>> {
  const systemPrompt = `You are a sales performance coach for a brick manufacturing business.
Analyze staff performance and provide constructive feedback.

Focus Areas:
- Lead engagement quality
- Conversion success rate
- Response timeliness
- Follow-up discipline
- Note-taking quality`;

  const userPrompt = `Generate coaching insights for this staff member (${period} period):

STAFF INFORMATION:
${staffContext}

PERFORMANCE METRICS:
${metricsContext}

Respond with JSON:
{
  "insights": [
    {
      "type": "strength|improvement|trend|alert",
      "title": "Brief title",
      "description": "Detailed insight",
      "metric": "metric name if applicable",
      "value": 0.0
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "area": "Focus area",
      "action": "Specific action",
      "expectedImpact": "Expected result"
    }
  ],
  "overallScore": 0.0
}`;

  return completeJson({
    systemPrompt,
    userPrompt,
    maxTokens: 1536,
    temperature: 0.6,
  });
}

export default {
  complete,
  completeJson,
  analyzeLead,
  generateScore,
  generateSuggestions,
  generateCoachingInsights,
};
