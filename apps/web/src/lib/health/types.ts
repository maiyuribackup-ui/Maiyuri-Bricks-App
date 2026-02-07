/**
 * Health Check System - Type Definitions
 *
 * Types for the proactive health monitoring system.
 * Used across all check agents, storage, alerting, and AI analysis.
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type RunType = 'morning' | 'evening' | 'manual';
export type AgentGroup = 'infrastructure' | 'external' | 'business';

export interface HealthCheckResult {
  checkName: string;
  serviceName: string;
  status: HealthStatus;
  responseTimeMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGroupResult {
  group: AgentGroup;
  checks: HealthCheckResult[];
  durationMs: number;
}

export interface HealthRunResult {
  runId: string;
  runType: RunType;
  overallStatus: HealthStatus;
  agentResults: AgentGroupResult[];
  aiAnalysis?: AIAnalysis;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
}

export interface AIAnalysis {
  overallStatus: string;
  diagnosis: string;
  correlations?: string;
  actionItems?: string[];
  businessImpact?: string;
}

export interface AlertState {
  checkName: string;
  lastStatus: HealthStatus;
  lastAlertAt: string;
  consecutiveFailures: number;
  resolvedAt?: string;
}

export interface CronExecution {
  cronName: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failed';
  durationMs?: number;
  errorMessage?: string;
}

export interface CronFreshness {
  cronName: string;
  expectedIntervalHours: number;
  lastRun: string | null;
  minutesSinceLastRun: number | null;
  isStale: boolean;
}

/** Thresholds for determining check status */
export const THRESHOLDS = {
  database: { degradedMs: 2000, timeoutMs: 5000 },
  auth: { degradedMs: 3000, timeoutMs: 5000 },
  storage: { degradedMs: 3000, timeoutMs: 5000 },
  telegram: { degradedMs: 3000, timeoutMs: 5000 },
  selfPing: { degradedMs: 2000, timeoutMs: 5000 },
  odoo: { degradedMs: 5000, timeoutMs: 10000 },
  anthropic: { degradedMs: 5000, timeoutMs: 10000 },
  gemini: { degradedMs: 5000, timeoutMs: 10000 },
  resend: { degradedMs: 3000, timeoutMs: 5000 },
  worker: {
    degradedPending: 5,
    unhealthyPending: 20,
    degradedFailed: 3,
    unhealthyFailed: 5,
  },
  staleLeads: { degradedCount: 5, unhealthyCount: 20 },
  syncErrors: { degradedCount: 5, unhealthyCount: 5 },
  stuckRecordings: { degradedCount: 1, unhealthyCount: 3 },
  nudgeFailure: { degradedPercent: 5, unhealthyPercent: 15 },
  quoteFailure: { degradedPercent: 5, unhealthyPercent: 15 },
  embeddingStuck: { degradedCount: 1, unhealthyCount: 5 },
  cronFreshness: { degradedStale: 1, unhealthyStale: 3 },
} as const;

/** Expected intervals for cron jobs */
export const CRON_EXPECTED_INTERVALS: Record<string, number> = {
  'nudge-digest': 24,
  'quote-nudges': 24,
  'daily-summary': 24,
  'weekly-ceo-briefing': 168, // 7 days
  'odoo-sync': 24,
  'delivery-sync': 24,
};
