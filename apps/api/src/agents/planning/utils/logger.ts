/**
 * Structured Logger for Planning Pipeline
 *
 * Provides consistent logging across all agents with:
 * - Structured JSON output for production
 * - Color-coded console output for development
 * - Session and agent context tracking
 */

import type { AgentName } from '../types/agent-result';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  sessionId?: string;
  agentName?: AgentName;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  structured: boolean;
  includeTimestamp: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

class PipelineLogger {
  private config: LoggerConfig;
  private defaultContext: LogContext;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      structured: process.env.NODE_ENV === 'production',
      includeTimestamp: true,
      ...config,
    };
    this.defaultContext = {};
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): PipelineLogger {
    const child = new PipelineLogger(this.config);
    child.defaultContext = { ...this.defaultContext, ...context };
    return child;
  }

  /**
   * Set default context for all logs
   */
  setContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Format and output a log entry
   */
  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.defaultContext, ...context },
    };

    if (this.config.structured) {
      // JSON output for production
      console.log(JSON.stringify(entry));
    } else {
      // Human-readable output for development
      const color = LOG_COLORS[level];
      const prefix = this.formatPrefix(entry);
      console.log(`${color}${prefix}${RESET_COLOR} ${message}`, this.formatContext(entry.context));
    }
  }

  private formatPrefix(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      parts.push(`[${entry.timestamp.slice(11, 23)}]`);
    }

    parts.push(`[${entry.level.toUpperCase().padEnd(5)}]`);

    if (entry.context.agentName) {
      parts.push(`[${entry.context.agentName}]`);
    }

    return parts.join(' ');
  }

  private formatContext(context: LogContext): string {
    const filtered = { ...context };
    delete filtered.sessionId;
    delete filtered.agentName;
    delete filtered.requestId;

    const keys = Object.keys(filtered);
    if (keys.length === 0) return '';

    return JSON.stringify(filtered);
  }

  // Log level methods
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Log agent execution start
   */
  agentStart(agentName: AgentName, sessionId: string): void {
    this.info(`Starting agent execution`, { agentName, sessionId });
  }

  /**
   * Log agent execution complete
   */
  agentComplete(
    agentName: AgentName,
    sessionId: string,
    executionTimeMs: number,
    openQuestionsCount: number
  ): void {
    this.info(`Agent execution complete`, {
      agentName,
      sessionId,
      executionTimeMs,
      openQuestionsCount,
    });
  }

  /**
   * Log agent execution failure
   */
  agentFailed(agentName: AgentName, sessionId: string, error: Error): void {
    this.error(`Agent execution failed`, {
      agentName,
      sessionId,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  }

  /**
   * Log pipeline halt
   */
  pipelineHalted(sessionId: string, reason: string, unansweredCount: number): void {
    this.warn(`Pipeline halted awaiting human input`, {
      sessionId,
      reason,
      unansweredCount,
    });
  }

  /**
   * Log token usage
   */
  tokenUsage(agentName: AgentName, input: number, output: number): void {
    this.debug(`Token usage`, {
      agentName,
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
    });
  }
}

// Export singleton instance
export const logger = new PipelineLogger();

// Export class for testing/custom instances
export { PipelineLogger };
