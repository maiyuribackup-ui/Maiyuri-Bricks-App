/**
 * BaseAgent - Abstract Base Class for All Planning Agents
 *
 * Implements the Template Method pattern (DRY principle).
 * All agents inherit from this class and implement specific methods.
 *
 * Flow:
 * 1. Validate input
 * 2. Build prompt
 * 3. Call Claude with retry
 * 4. Parse and validate output
 * 5. Extract open questions
 * 6. Return structured result
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DesignContext } from '../types/design-context';
import type {
  AgentName,
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import { validateSchema, type ValidationResult } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES } from '../prompts/system-rules';

/**
 * Base configuration for all agents
 */
export interface BaseAgentConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: BaseAgentConfig = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3, // Low temperature for deterministic output
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Abstract Base Agent
 *
 * @template TInput - Agent-specific input type
 * @template TOutput - Agent-specific output type
 */
export abstract class BaseAgent<TInput, TOutput> {
  protected anthropic: Anthropic;
  protected config: BaseAgentConfig;

  /** Unique agent identifier */
  abstract readonly agentName: AgentName;

  /** Agent-specific system prompt (appended to SYSTEM_RULES) */
  protected abstract readonly systemPrompt: string;

  constructor(config: Partial<BaseAgentConfig> = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };

    // Initialize Anthropic client
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }

  /**
   * Main execution method - Template Method Pattern
   *
   * This method defines the algorithm skeleton.
   * Subclasses override specific steps via abstract methods.
   */
  async execute(
    input: TInput,
    context: DesignContext
  ): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Check token budget
      const estimatedTokens = this.estimateTokens(input, context);
      if (!tokenBudget.canProceed(estimatedTokens)) {
        throw new Error('Token budget exceeded');
      }

      // Step 3: Build prompt
      const prompt = this.buildPrompt(input, context);

      // Step 4: Call Claude with retry
      const response = await retryWithBackoff(
        () => this.callClaude(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Validate output against schema
      const validated = this.validateOutput(rawOutput);
      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.errors?.map(e => e.message).join(', ')}`
        );
      }

      // Step 7: Extract open questions and assumptions
      const openQuestions = this.extractOpenQuestions(validated.data!);
      const assumptions = this.extractAssumptions(validated.data!);

      // Step 8: Track token usage
      const tokensUsed: TokenUsage = {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
        total:
          (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      };
      tokenBudget.track(this.agentName, tokensUsed);

      const executionTimeMs = Date.now() - startTime;
      agentLogger.agentComplete(
        this.agentName,
        context.sessionId,
        executionTimeMs,
        openQuestions.length
      );

      return {
        success: true,
        agentName: this.agentName,
        executionTimeMs,
        tokensUsed,
        data: validated.data,
        openQuestions,
        assumptions,
        meta: {
          model: this.config.model,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      agentLogger.agentFailed(this.agentName, context.sessionId, err);

      const agentError: AgentError = {
        code: this.getErrorCode(error),
        message: err.message,
        retryable: this.isRetryable(error),
      };

      return {
        success: false,
        agentName: this.agentName,
        executionTimeMs,
        tokensUsed: { input: 0, output: 0, total: 0 },
        error: agentError,
        openQuestions: [],
        assumptions: [],
      };
    }
  }

  /**
   * Call Claude API
   */
  protected async callClaude(prompt: string): Promise<Anthropic.Message> {
    const fullSystemPrompt = `${SYSTEM_RULES}\n\n${this.systemPrompt}`;

    return this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });
  }

  /**
   * Parse Claude response to extract JSON
   */
  protected parseResponse(response: Anthropic.Message): unknown {
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    let content = textContent.text.trim();

    // Remove markdown code blocks if present
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }

    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }

    content = content.trim();

    try {
      return JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}...`);
    }
  }

  /**
   * Validate output against agent's schema
   */
  protected validateOutput(data: unknown): ValidationResult<TOutput> {
    return validateSchema<TOutput>(this.agentName, data);
  }

  /**
   * Extract open questions from output
   */
  protected extractOpenQuestions(data: TOutput): OpenQuestion[] {
    const output = data as Record<string, unknown>;
    const questions = (output.open_questions || output.questions || []) as Array<{
      id?: string;
      question?: string;
      type?: 'mandatory' | 'optional';
      reason?: string;
    }>;

    return questions.map((q, index) => ({
      agentSource: this.agentName,
      questionId: q.id || `${this.agentName}-Q${index + 1}`,
      question: q.question || String(q),
      type: q.type || 'mandatory',
      reason: q.reason || 'Clarification needed for design decisions',
    }));
  }

  /**
   * Extract assumptions from output
   */
  protected extractAssumptions(data: TOutput): Assumption[] {
    const output = data as Record<string, unknown>;
    const assumptions = (output.assumptions || []) as Array<{
      assumption?: string;
      risk?: 'low' | 'medium' | 'high';
      basis?: string;
    }>;

    return assumptions.map((a, index) => ({
      agentSource: this.agentName,
      assumptionId: `${this.agentName}-A${index + 1}`,
      assumption: a.assumption || String(a),
      risk: a.risk || 'medium',
      basis: a.basis,
    }));
  }

  /**
   * Estimate tokens for the request (rough estimation)
   */
  protected estimateTokens(input: TInput, context: DesignContext): number {
    const inputStr = JSON.stringify(input);
    const contextStr = JSON.stringify(context);
    const totalChars = inputStr.length + contextStr.length + this.systemPrompt.length;
    // Rough estimate: 4 characters per token
    return Math.ceil(totalChars / 4) + 1000; // Add buffer for output
  }

  /**
   * Get error code from error object
   */
  protected getErrorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (typeof err.code === 'string') return err.code;
      if (typeof err.type === 'string') return err.type;
      if (typeof err.status === 'number') return `HTTP_${err.status}`;
    }
    return 'AGENT_ERROR';
  }

  /**
   * Check if error is retryable
   */
  protected isRetryable(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err.status === 429 || err.status === 529) return true;
      if (err.status && typeof err.status === 'number' && err.status >= 500) return true;
    }
    return false;
  }

  // ============================================
  // Abstract Methods (Subclasses Must Implement)
  // ============================================

  /**
   * Validate the input before processing
   * @throws Error if input is invalid
   */
  protected abstract validateInput(input: TInput): void;

  /**
   * Build the user prompt for Claude
   */
  protected abstract buildPrompt(input: TInput, context: DesignContext): string;
}
