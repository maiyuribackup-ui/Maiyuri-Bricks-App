/**
 * Custom Error Classes for Planning Pipeline
 *
 * Specialized errors for different failure scenarios.
 */

import type { DesignContext } from './types/design-context';
import type { AgentName, OpenQuestion } from './types/agent-result';

/**
 * Base error for pipeline failures
 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public context: DesignContext,
    public cause?: Error
  ) {
    super(message);
    this.name = 'PipelineError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error when pipeline halts for human input
 */
export class HaltError extends Error {
  constructor(
    public openQuestions: OpenQuestion[],
    public context: DesignContext
  ) {
    super(`Pipeline halted: ${openQuestions.length} questions require human input`);
    this.name = 'HaltError';
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Get mandatory questions only
   */
  getMandatoryQuestions(): OpenQuestion[] {
    return this.openQuestions.filter(q => q.type === 'mandatory');
  }

  /**
   * Check if all mandatory questions are answered
   */
  canResume(): boolean {
    return this.getMandatoryQuestions().every(q => q.answer !== undefined);
  }
}

/**
 * Error when schema validation fails
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public schemaErrors: Array<{
      path: string;
      message: string;
      expected?: string;
      received?: string;
    }>,
    public agentName?: AgentName
  ) {
    super(message);
    this.name = 'ValidationError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error when a specific agent fails
 */
export class AgentExecutionError extends Error {
  constructor(
    message: string,
    public agentName: AgentName,
    public retryable: boolean,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AgentExecutionError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error when token budget is exceeded
 */
export class TokenBudgetError extends Error {
  constructor(
    public used: number,
    public limit: number,
    public agentName?: AgentName
  ) {
    super(`Token budget exceeded: ${used}/${limit} tokens used`);
    this.name = 'TokenBudgetError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error when input validation fails
 */
export class InputValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public agentName?: AgentName
  ) {
    super(message);
    this.name = 'InputValidationError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error when design validation fails (Agent 10)
 */
export class DesignValidationError extends Error {
  constructor(
    public issues: Array<{
      id: string;
      type: 'error' | 'warning' | 'info';
      category: string;
      message: string;
    }>,
    public context: DesignContext
  ) {
    const errorCount = issues.filter(i => i.type === 'error').length;
    super(`Design validation failed with ${errorCount} errors`);
    this.name = 'DesignValidationError';
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Get critical errors only
   */
  getCriticalErrors(): Array<{
    id: string;
    type: 'error' | 'warning' | 'info';
    category: string;
    message: string;
  }> {
    return this.issues.filter(i => i.type === 'error');
  }
}
