/**
 * Token Budget Manager
 *
 * Tracks and limits token usage across the pipeline to:
 * - Prevent runaway costs
 * - Trigger context summarization when needed
 * - Provide usage analytics
 */

import type { AgentName, TokenUsage } from '../types/agent-result';
import { logger } from './logger';

/**
 * Token budget configuration
 */
export interface TokenBudgetConfig {
  /** Maximum total tokens for the pipeline */
  totalLimit: number;
  /** Per-agent token limit */
  perAgentLimit: number;
  /** Threshold to trigger summarization (as fraction of total) */
  summarizationThreshold: number;
  /** Warning threshold (as fraction of total) */
  warningThreshold: number;
}

/**
 * Default token budget configuration
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudgetConfig = {
  totalLimit: 100000,
  perAgentLimit: 15000,
  summarizationThreshold: 0.7,
  warningThreshold: 0.85,
};

/**
 * Token usage record for an agent
 */
interface AgentTokenRecord {
  input: number;
  output: number;
  calls: number;
}

/**
 * Token Budget Manager
 *
 * Tracks token usage and enforces limits across the pipeline.
 */
export class TokenBudget {
  private config: TokenBudgetConfig;
  private byAgent: Map<AgentName, AgentTokenRecord>;
  private sessionId?: string;

  constructor(config: Partial<TokenBudgetConfig> = {}) {
    this.config = { ...DEFAULT_TOKEN_BUDGET, ...config };
    this.byAgent = new Map();
  }

  /**
   * Set session ID for logging context
   */
  setSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get total tokens used across all agents
   */
  get totalUsed(): number {
    let total = 0;
    for (const record of this.byAgent.values()) {
      total += record.input + record.output;
    }
    return total;
  }

  /**
   * Get remaining token budget
   */
  get remaining(): number {
    return Math.max(0, this.config.totalLimit - this.totalUsed);
  }

  /**
   * Get usage as percentage of total budget
   */
  get usagePercent(): number {
    return (this.totalUsed / this.config.totalLimit) * 100;
  }

  /**
   * Check if we can proceed with estimated tokens
   */
  canProceed(estimatedTokens: number): boolean {
    return this.totalUsed + estimatedTokens <= this.config.totalLimit;
  }

  /**
   * Check if an agent can proceed based on its limit
   */
  canAgentProceed(agentName: AgentName, estimatedTokens: number): boolean {
    const record = this.byAgent.get(agentName);
    const currentUsage = record ? record.input + record.output : 0;
    return currentUsage + estimatedTokens <= this.config.perAgentLimit;
  }

  /**
   * Check if context should be summarized
   */
  shouldSummarize(): boolean {
    return this.usagePercent >= this.config.summarizationThreshold * 100;
  }

  /**
   * Check if we're in warning territory
   */
  isWarningLevel(): boolean {
    return this.usagePercent >= this.config.warningThreshold * 100;
  }

  /**
   * Track token usage for an agent
   */
  track(agentName: AgentName, usage: TokenUsage): void {
    const existing = this.byAgent.get(agentName) || {
      input: 0,
      output: 0,
      calls: 0,
    };

    const updated: AgentTokenRecord = {
      input: existing.input + usage.input,
      output: existing.output + usage.output,
      calls: existing.calls + 1,
    };

    this.byAgent.set(agentName, updated);

    // Log usage
    logger.tokenUsage(agentName, usage.input, usage.output);

    // Check thresholds
    if (this.isWarningLevel()) {
      logger.warn(`Token budget warning: ${this.usagePercent.toFixed(1)}% used`, {
        sessionId: this.sessionId,
        totalUsed: this.totalUsed,
        remaining: this.remaining,
      });
    }
  }

  /**
   * Get usage statistics for an agent
   */
  getAgentUsage(agentName: AgentName): AgentTokenRecord | undefined {
    return this.byAgent.get(agentName);
  }

  /**
   * Get usage report for all agents
   */
  getUsageReport(): Record<string, unknown> {
    const byAgentReport: Record<string, AgentTokenRecord> = {};
    for (const [name, record] of this.byAgent) {
      byAgentReport[name] = record;
    }

    return {
      totalUsed: this.totalUsed,
      totalLimit: this.config.totalLimit,
      remaining: this.remaining,
      usagePercent: this.usagePercent.toFixed(2),
      shouldSummarize: this.shouldSummarize(),
      isWarningLevel: this.isWarningLevel(),
      byAgent: byAgentReport,
    };
  }

  /**
   * Estimate tokens for a string
   * Rough estimation: ~4 characters per token for English
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate tokens for a JSON object
   */
  static estimateJsonTokens(obj: unknown): number {
    const json = JSON.stringify(obj);
    return TokenBudget.estimateTokens(json);
  }

  /**
   * Reset the budget (for new session)
   */
  reset(): void {
    this.byAgent.clear();
    this.sessionId = undefined;
  }

  /**
   * Create a serializable summary for DesignContext
   */
  toContextSummary(): {
    total: number;
    byAgent: Record<AgentName, { input: number; output: number }>;
  } {
    const byAgent: Record<string, { input: number; output: number }> = {};
    for (const [name, record] of this.byAgent) {
      byAgent[name] = { input: record.input, output: record.output };
    }

    return {
      total: this.totalUsed,
      byAgent: byAgent as Record<AgentName, { input: number; output: number }>,
    };
  }
}

// Export singleton instance for shared usage
export const tokenBudget = new TokenBudget();
