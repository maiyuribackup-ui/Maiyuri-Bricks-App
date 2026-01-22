/**
 * AI Observability Service
 *
 * Centralized observability for all AI/LLM operations using Langfuse.
 * Provides tracing, cost tracking, and performance monitoring.
 *
 * @see https://langfuse.com/docs
 */

import { Langfuse } from "langfuse";
import type { LangfuseTraceClient } from "langfuse";

// Singleton Langfuse instance
let langfuseInstance: Langfuse | null = null;

// Track if we've logged the disabled warning
let hasLoggedDisabledWarning = false;

/**
 * Check if Langfuse is properly configured
 */
export function isLangfuseEnabled(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
  );
}

/**
 * Get or create the Langfuse singleton instance
 */
export function getLangfuse(): Langfuse | null {
  if (!isLangfuseEnabled()) {
    if (!hasLoggedDisabledWarning) {
      console.warn(
        "[Observability] Langfuse is not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable.",
      );
      hasLoggedDisabledWarning = true;
    }
    return null;
  }

  if (!langfuseInstance) {
    langfuseInstance = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST, // Support both env var names
      flushAt: 5, // Flush after 5 events (default is 20)
      flushInterval: 5000, // Flush every 5 seconds (default is 10s)
    });
  }

  return langfuseInstance;
}

/**
 * Trace context for correlating related AI operations
 */
export interface TraceContext {
  /** Unique trace ID for correlating requests */
  traceId: string;
  /** User who initiated the request */
  userId?: string;
  /** Lead being processed (if applicable) */
  leadId?: string;
  /** Type of AI agent/operation */
  agentType: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Session ID for grouping user sessions */
  sessionId?: string;
  /** Tags for filtering traces */
  tags?: string[];
}

/**
 * Create a new trace for an AI operation
 */
export function createTrace(ctx: TraceContext): LangfuseTraceClient | null {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  return langfuse.trace({
    id: ctx.traceId,
    name: ctx.agentType,
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    tags: ctx.tags,
    metadata: {
      leadId: ctx.leadId,
      agentType: ctx.agentType,
      environment: process.env.NODE_ENV || "development",
      ...ctx.metadata,
    },
  });
}

/**
 * Model pricing for cost calculation (per 1K tokens)
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  {
    // Claude models
    "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
    "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
    "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
    "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },

    // Gemini models
    "gemini-2.5-flash-preview-05-20": { input: 0.000075, output: 0.0003 },
    "gemini-2.5-pro": { input: 0.00125, output: 0.005 },
    "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
    "gemini-1.5-pro": { input: 0.00125, output: 0.005 },

    // OpenAI models (fallback)
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },

    // Default fallback pricing
    default: { input: 0.001, output: 0.002 },
  };

/**
 * Calculate cost for an LLM call
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
}

/**
 * Usage statistics returned from tracked calls
 */
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
}

/**
 * Flush all pending events to Langfuse
 * Call this before serverless function ends
 */
export async function flushObservability(): Promise<void> {
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.flushAsync();
  }
}

/**
 * Shutdown Langfuse client gracefully
 */
export async function shutdownObservability(): Promise<void> {
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.shutdownAsync();
    langfuseInstance = null;
  }
}

/**
 * Score a trace for quality evaluation
 */
export function scoreTrace(
  traceId: string,
  name: string,
  value: number,
  comment?: string,
): void {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  langfuse.score({
    traceId,
    name,
    value,
    comment,
  });
}

/**
 * Log an event within a trace
 */
export function logEvent(
  traceId: string,
  name: string,
  metadata?: Record<string, unknown>,
  level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR",
): void {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  // Get the trace and add an event
  const trace = langfuse.trace({ id: traceId });
  trace.event({
    name,
    metadata,
    level,
  });
}

export default {
  getLangfuse,
  isLangfuseEnabled,
  createTrace,
  calculateCost,
  flushObservability,
  shutdownObservability,
  scoreTrace,
  logEvent,
  MODEL_PRICING,
};
