/**
 * Health Check Runner
 *
 * Orchestrates 3 parallel agent groups:
 * 1. Infrastructure (DB, Auth, Storage, Telegram, Self-ping)
 * 2. External Services (Odoo, Anthropic, Gemini, Resend, Worker)
 * 3. Business Logic (Leads, Sync, Recordings, Nudges, Quotes, Embeddings, Crons)
 *
 * Then runs AI analysis and sends Telegram report.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  HealthRunResult,
  AgentGroupResult,
  HealthStatus,
  RunType,
} from './types';
import { runInfrastructureChecks } from './checks/infrastructure';
import { runExternalServicesChecks } from './checks/external-services';
import { runBusinessLogicChecks } from './checks/business-logic';
import { analyzeHealthResults } from './ai-analyzer';
import {
  sendHealthReport,
  sendUrgentAlertIfNeeded,
  sendRecoveryAlerts,
  updateAlertStates,
} from './alerts';
import {
  saveRunResults,
  saveAIAnalysis,
  getLastRunResults,
  cleanupOldResults,
} from './storage';

/**
 * Run the full health check suite
 *
 * Phase 1: Run 3 agent groups in parallel
 * Phase 2: AI analysis of results
 * Phase 3: Store, alert, report
 */
export async function runHealthCheck(
  runType: RunType = 'manual',
): Promise<HealthRunResult> {
  const runId = uuidv4();
  const startedAt = new Date().toISOString();

  console.log(`[HealthCheck] Starting ${runType} run: ${runId}`);

  // Phase 1: Run all 3 agent groups in parallel
  const [infraResults, externalResults, businessResults] =
    await Promise.allSettled([
      runAgentGroup('infrastructure', runInfrastructureChecks),
      runAgentGroup('external', runExternalServicesChecks),
      runAgentGroup('business', runBusinessLogicChecks),
    ]);

  const agentResults: AgentGroupResult[] = [
    extractAgentResult(infraResults, 'infrastructure'),
    extractAgentResult(externalResults, 'external'),
    extractAgentResult(businessResults, 'business'),
  ];

  // Calculate overall status
  const overallStatus = calculateOverallStatus(agentResults);

  console.log(
    `[HealthCheck] Phase 1 complete: ${overallStatus}`,
  );

  // Phase 2: AI analysis
  const previousResults = await getLastRunResults();
  const { analysis, rawPrompt, rawResponse } = await analyzeHealthResults(
    agentResults,
    previousResults,
  );

  const completedAt = new Date().toISOString();
  const totalDurationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const result: HealthRunResult = {
    runId,
    runType,
    overallStatus,
    agentResults,
    aiAnalysis: analysis,
    startedAt,
    completedAt,
    totalDurationMs,
  };

  console.log(
    `[HealthCheck] Phase 2 complete: AI says ${analysis.overallStatus}`,
  );

  // Phase 3: Store, alert, report
  await Promise.allSettled([
    saveRunResults(result),
    saveAIAnalysis(runId, analysis, rawPrompt, rawResponse),
  ]);

  // Send alerts and report
  await sendRecoveryAlerts(result);
  await updateAlertStates(result);
  await sendHealthReport(result);

  if (overallStatus === 'unhealthy') {
    await sendUrgentAlertIfNeeded(result);
  }

  // Cleanup old results (daily morning run only)
  if (runType === 'morning') {
    const cleaned = await cleanupOldResults();
    if (cleaned > 0) {
      console.log(`[HealthCheck] Cleaned ${cleaned} old results`);
    }
  }

  console.log(
    `[HealthCheck] Run ${runId} completed in ${totalDurationMs}ms`,
  );

  return result;
}

// --- Internal helpers ---

async function runAgentGroup(
  group: string,
  checkFn: () => Promise<import('./types').HealthCheckResult[]>,
): Promise<AgentGroupResult> {
  const startTime = Date.now();
  const checks = await checkFn();
  const durationMs = Date.now() - startTime;

  return {
    group: group as AgentGroupResult['group'],
    checks,
    durationMs,
  };
}

function extractAgentResult(
  settled: PromiseSettledResult<AgentGroupResult>,
  group: AgentGroupResult['group'],
): AgentGroupResult {
  if (settled.status === 'fulfilled') {
    return settled.value;
  }

  // Agent group itself failed - return a single unhealthy check
  return {
    group,
    checks: [
      {
        checkName: `${group}-agent`,
        serviceName: `${group} Agent`,
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage:
          settled.reason instanceof Error
            ? settled.reason.message
            : 'Agent group failed',
      },
    ],
    durationMs: 0,
  };
}

function calculateOverallStatus(
  agentResults: AgentGroupResult[],
): HealthStatus {
  const allChecks = agentResults.flatMap((a) => a.checks);
  const hasUnhealthy = allChecks.some((c) => c.status === 'unhealthy');
  const hasDegraded = allChecks.some((c) => c.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}
