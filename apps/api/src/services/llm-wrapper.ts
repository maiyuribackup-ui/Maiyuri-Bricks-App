/**
 * LLM Wrapper with Observability
 *
 * Wraps LLM calls with automatic tracing, cost tracking, and error handling.
 * Use this wrapper to instrument any AI call for observability.
 *
 * @example
 * ```typescript
 * const result = await trackedLLMCall(
 *   {
 *     agentType: 'lead-scorer',
 *     model: 'claude-sonnet-4-20250514',
 *     prompt: userPrompt,
 *     leadId: lead.id,
 *   },
 *   async () => {
 *     const response = await anthropic.messages.create({ ... });
 *     return {
 *       result: response.content[0].text,
 *       usage: response.usage,
 *     };
 *   }
 * );
 * ```
 */

import { v4 as uuidv4 } from "uuid";
import {
  createTrace,
  calculateCost,
  getLangfuse,
  flushObservability,
  type TraceContext,
  type UsageStats,
} from "./observability";

/**
 * Options for a tracked LLM call
 */
export interface LLMCallOptions {
  /** Existing trace ID for correlation (optional - will generate if not provided) */
  traceId?: string;
  /** User who initiated the request */
  userId?: string;
  /** Lead being processed */
  leadId?: string;
  /** Type of AI agent making the call */
  agentType: string;
  /** Model being used */
  model: string;
  /** Input prompt(s) - for logging */
  prompt: string | { system?: string; user: string };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Session ID for grouping */
  sessionId?: string;
  /** Tags for filtering */
  tags?: string[];
  /** Name for this specific generation (defaults to agentType) */
  generationName?: string;
}

/**
 * Usage data returned from LLM providers
 */
export interface LLMProviderUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Result from a tracked LLM call
 */
export interface LLMCallResult<T> {
  /** The actual result from the LLM */
  result: T;
  /** Usage statistics */
  usage: UsageStats;
  /** Trace ID for this call (for correlation or scoring) */
  traceId: string;
  /** Provider that handled the request */
  provider?: string;
}

/**
 * Wrapper for LLM calls that adds observability
 *
 * @param options - Configuration for the traced call
 * @param llmFn - The actual LLM function to execute
 * @returns Result with usage stats and trace ID
 */
export async function trackedLLMCall<T>(
  options: LLMCallOptions,
  llmFn: () => Promise<{
    result: T;
    usage: LLMProviderUsage;
    provider?: string;
  }>,
): Promise<LLMCallResult<T>> {
  const traceId = options.traceId || uuidv4();
  const startTime = Date.now();
  const langfuse = getLangfuse();

  // Create trace (if Langfuse is enabled)
  const trace = createTrace({
    traceId,
    userId: options.userId,
    leadId: options.leadId,
    agentType: options.agentType,
    metadata: options.metadata,
    sessionId: options.sessionId,
    tags: options.tags,
  });

  // Create generation span for this LLM call
  const generation = trace?.generation({
    name: options.generationName || `${options.agentType}-llm-call`,
    model: options.model,
    input:
      typeof options.prompt === "string"
        ? options.prompt
        : {
            system: options.prompt.system,
            user: options.prompt.user,
          },
    metadata: {
      ...options.metadata,
      timestamp: new Date().toISOString(),
    },
  });

  try {
    const response = await llmFn();
    const latencyMs = Date.now() - startTime;

    const cost = calculateCost(
      options.model,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    const usage: UsageStats = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      cost,
      latencyMs,
    };

    // End generation with success
    generation?.end({
      output: response.result,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      metadata: {
        cost,
        latencyMs,
        provider: response.provider || "primary",
      },
    });

    // Update trace with summary
    trace?.update({
      metadata: {
        totalTokens: usage.totalTokens,
        totalCost: cost,
        latencyMs,
        status: "success",
        provider: response.provider || "primary",
      },
    });

    return {
      result: response.result,
      usage,
      traceId,
      provider: response.provider,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // End generation with error
    generation?.end({
      level: "ERROR",
      statusMessage: errorMessage,
      metadata: {
        latencyMs,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
    });

    // Update trace with error info
    trace?.update({
      metadata: {
        status: "error",
        errorMessage,
        latencyMs,
      },
    });

    // Re-throw to let caller handle
    throw error;
  }
}

/**
 * Track a multi-step AI workflow (e.g., Lead Manager calling multiple sub-agents)
 *
 * @param options - Trace configuration
 * @param workflowFn - The workflow function to execute
 * @returns Result with aggregated usage stats
 */
export async function trackedWorkflow<T>(
  options: Omit<LLMCallOptions, "prompt" | "model">,
  workflowFn: (traceId: string) => Promise<{
    result: T;
    steps: Array<{ name: string; usage: UsageStats }>;
  }>,
): Promise<{
  result: T;
  totalUsage: UsageStats;
  traceId: string;
}> {
  const traceId = options.traceId || uuidv4();
  const startTime = Date.now();

  // Create parent trace
  const trace = createTrace({
    traceId,
    userId: options.userId,
    leadId: options.leadId,
    agentType: options.agentType,
    metadata: {
      ...options.metadata,
      workflowType: "multi-step",
    },
    sessionId: options.sessionId,
    tags: options.tags,
  });

  try {
    const { result, steps } = await workflowFn(traceId);
    const latencyMs = Date.now() - startTime;

    // Aggregate usage from all steps
    const totalUsage: UsageStats = steps.reduce(
      (acc, step) => ({
        inputTokens: acc.inputTokens + step.usage.inputTokens,
        outputTokens: acc.outputTokens + step.usage.outputTokens,
        totalTokens: acc.totalTokens + step.usage.totalTokens,
        cost: acc.cost + step.usage.cost,
        latencyMs: acc.latencyMs + step.usage.latencyMs,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        latencyMs: 0,
      },
    );

    // Override latencyMs with actual end-to-end time
    totalUsage.latencyMs = latencyMs;

    // Update trace with summary
    trace?.update({
      output: { stepCount: steps.length },
      metadata: {
        totalTokens: totalUsage.totalTokens,
        totalCost: totalUsage.cost,
        latencyMs,
        status: "success",
        steps: steps.map((s) => ({
          name: s.name,
          tokens: s.usage.totalTokens,
          cost: s.usage.cost,
        })),
      },
    });

    return {
      result,
      totalUsage,
      traceId,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    trace?.update({
      metadata: {
        status: "error",
        errorMessage,
        latencyMs,
      },
    });

    throw error;
  }
}

/**
 * Create a child span within an existing trace
 * Use this for tracking sub-operations within a workflow
 */
export function createSpan(
  traceId: string,
  name: string,
  metadata?: Record<string, unknown>,
) {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  const trace = langfuse.trace({ id: traceId });
  return trace.span({
    name,
    metadata,
  });
}

/**
 * Ensure all observability data is flushed
 * Call this at the end of serverless function execution
 */
export { flushObservability };

export default {
  trackedLLMCall,
  trackedWorkflow,
  createSpan,
  flushObservability,
};
