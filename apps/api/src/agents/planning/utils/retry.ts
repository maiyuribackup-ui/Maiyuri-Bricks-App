/**
 * Retry Utility with Exponential Backoff
 *
 * Handles transient failures in Claude API calls with:
 * - Exponential backoff with jitter
 * - Configurable retry limits
 * - Error classification (retryable vs non-retryable)
 */

import { logger } from './logger';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Exponential base (default 2) */
  exponentialBase: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitter: true,
};

/**
 * Error codes that are safe to retry
 */
const RETRYABLE_ERROR_CODES = new Set([
  // Anthropic API errors
  'rate_limit_error',
  'overloaded_error',
  'api_error',
  'timeout',
  // Network errors
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * HTTP status codes that are safe to retry
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests (Rate Limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  529, // Overloaded (Anthropic)
]);

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  // Check for Anthropic API error structure
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Check status code
    if (typeof err.status === 'number' && RETRYABLE_STATUS_CODES.has(err.status)) {
      return true;
    }

    // Check error type/code
    if (typeof err.type === 'string' && RETRYABLE_ERROR_CODES.has(err.type)) {
      return true;
    }

    if (typeof err.code === 'string' && RETRYABLE_ERROR_CODES.has(err.code)) {
      return true;
    }

    // Check nested error
    if (err.error && typeof err.error === 'object') {
      return isRetryableError(err.error);
    }
  }

  return false;
}

/**
 * Calculate delay for a retry attempt with optional jitter
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential backoff: baseDelay * (exponentialBase ^ attempt)
  let delay = config.baseDelayMs * Math.pow(config.exponentialBase, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter (±25% randomization)
  if (config.jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }

  return Math.floor(delay);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 *
 * @template T - Return type of the function
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === fullConfig.maxRetries) {
        logger.error(`All retry attempts exhausted`, {
          attempt: attempt + 1,
          maxRetries: fullConfig.maxRetries,
          error: lastError.message,
        });
        throw lastError;
      }

      if (!isRetryableError(error)) {
        logger.warn(`Non-retryable error encountered`, {
          attempt: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate and wait
      const delay = calculateDelay(attempt, fullConfig);

      logger.warn(`Retry attempt ${attempt + 1}/${fullConfig.maxRetries}`, {
        delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Decorator-style retry wrapper
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: Parameters<T>) => {
    return retryWithBackoff(() => fn(...args), config);
  }) as T;
}

/**
 * Context manager for retryable operations
 */
export class RetryContext {
  private config: RetryConfig;
  private attemptCount: number = 0;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  get attempts(): number {
    return this.attemptCount;
  }

  get canRetry(): boolean {
    return this.attemptCount < this.config.maxRetries;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.attemptCount = 0;
    return retryWithBackoff(fn, this.config);
  }
}
