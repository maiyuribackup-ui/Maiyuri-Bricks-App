/**
 * Health Check Alerts
 *
 * Telegram reporting and urgent alert system with deduplication.
 * Sends rich formatted reports to the notification group.
 */

import { sendAppNotification } from '@/lib/telegram';
import type {
  HealthRunResult,
  HealthCheckResult,
  AIAnalysis,
  AgentGroupResult,
} from './types';
import { getAlertState, upsertAlertState } from './storage';

const STATUS_EMOJI: Record<string, string> = {
  healthy: '✅',
  degraded: '⚠️',
  unhealthy: '⛔',
  HEALTHY: '🟢',
  DEGRADED: '🟡',
  CRITICAL: '🔴',
};

/**
 * Send the full health check report to Telegram
 */
export async function sendHealthReport(result: HealthRunResult): Promise<void> {
  const timeLabel =
    result.runType === 'morning'
      ? 'MORNING'
      : result.runType === 'evening'
        ? 'EVENING'
        : 'MANUAL';

  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Dubai' });
  const totalChecks = result.agentResults.reduce(
    (sum, a) => sum + a.checks.length,
    0,
  );
  const healthyCount = result.agentResults.reduce(
    (sum, a) => sum + a.checks.filter((c) => c.status === 'healthy').length,
    0,
  );

  const overallEmoji =
    STATUS_EMOJI[result.aiAnalysis?.overallStatus ?? 'HEALTHY'] ?? '🟢';

  let message = `🏥 *${timeLabel} HEALTH CHECK*\n\n`;
  message += `Overall: ${overallEmoji} ${result.overallStatus.toUpperCase()} (${healthyCount}/${totalChecks} checks passed)\n\n`;

  // AI Diagnosis
  if (result.aiAnalysis) {
    message += `📊 *AI Diagnosis:*\n${result.aiAnalysis.diagnosis}\n\n`;
  }

  // Per-agent group summary
  for (const agent of result.agentResults) {
    const groupLabel = formatGroupLabel(agent.group);
    const groupHealthy = agent.checks.filter(
      (c) => c.status === 'healthy',
    ).length;
    const groupTotal = agent.checks.length;
    const allHealthy = groupHealthy === groupTotal;

    message += `${allHealthy ? '✅' : '⚠️'} *${groupLabel}:* ${groupHealthy}/${groupTotal} healthy\n`;

    // Show failing checks
    const failing = agent.checks.filter((c) => c.status !== 'healthy');
    for (const check of failing) {
      const emoji = STATUS_EMOJI[check.status] ?? '❓';
      const detail = check.errorMessage
        ? ` (${check.errorMessage.slice(0, 60)})`
        : check.responseTimeMs > 0
          ? ` (${check.responseTimeMs}ms)`
          : '';
      message += `  └ ${emoji} ${check.serviceName}: ${check.status.toUpperCase()}${detail}\n`;
    }
  }

  // AI Recommendations
  if (
    result.aiAnalysis?.actionItems &&
    result.aiAnalysis.actionItems.length > 0
  ) {
    message += `\n💡 *Recommendations:*\n`;
    for (const item of result.aiAnalysis.actionItems.slice(0, 3)) {
      message += `• ${item}\n`;
    }
  }

  // Business impact
  if (
    result.aiAnalysis?.businessImpact &&
    result.overallStatus !== 'healthy'
  ) {
    message += `\n⚡ *Business Impact:*\n${result.aiAnalysis.businessImpact}\n`;
  }

  message += `\n⏱️ Total: ${(result.totalDurationMs / 1000).toFixed(1)}s | ${now}`;

  await sendAppNotification(message.trim());
}

/**
 * Send an urgent alert for unhealthy checks (separate from report)
 */
export async function sendUrgentAlertIfNeeded(
  result: HealthRunResult,
): Promise<void> {
  const unhealthyChecks = result.agentResults.flatMap((a) =>
    a.checks.filter((c) => c.status === 'unhealthy'),
  );

  if (unhealthyChecks.length === 0) return;

  // Check dedup - only alert if state changed since last run
  const shouldAlert = await shouldSendUrgentAlert(unhealthyChecks);
  if (!shouldAlert) return;

  let message = `🚨 *HEALTH ALERT - CRITICAL*\n\n`;

  for (const check of unhealthyChecks) {
    message += `⛔ ${check.serviceName}: UNHEALTHY`;
    if (check.errorMessage) {
      message += ` (${check.errorMessage.slice(0, 80)})`;
    }
    message += '\n';
  }

  if (result.aiAnalysis) {
    message += `\n🤖 *AI Diagnosis:*\n${result.aiAnalysis.diagnosis}\n`;

    if (
      result.aiAnalysis.actionItems &&
      result.aiAnalysis.actionItems.length > 0
    ) {
      message += `\n🎯 *Immediate Actions:*\n`;
      for (let i = 0; i < result.aiAnalysis.actionItems.length; i++) {
        message += `${i + 1}. ${result.aiAnalysis.actionItems[i]}\n`;
      }
    }

    if (result.aiAnalysis.businessImpact) {
      message += `\n⚡ *Business Impact:*\n${result.aiAnalysis.businessImpact}\n`;
    }
  }

  await sendAppNotification(message.trim());
}

/**
 * Send recovery notifications for checks that were unhealthy but are now healthy
 */
export async function sendRecoveryAlerts(
  result: HealthRunResult,
): Promise<void> {
  const recoveries: string[] = [];

  for (const agent of result.agentResults) {
    for (const check of agent.checks) {
      if (check.status === 'healthy') {
        const alertState = await getAlertState(check.checkName);
        if (
          alertState &&
          alertState.lastStatus !== 'healthy' &&
          !alertState.resolvedAt
        ) {
          recoveries.push(check.serviceName);
          await upsertAlertState({
            checkName: check.checkName,
            lastStatus: 'healthy',
            lastAlertAt: new Date().toISOString(),
            consecutiveFailures: 0,
            resolvedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  if (recoveries.length > 0) {
    const message =
      `✅ *HEALTH RECOVERED*\n\n` +
      recoveries.map((s) => `• ${s}: back to HEALTHY`).join('\n');
    await sendAppNotification(message);
  }
}

/**
 * Update alert state for all checks in the run
 */
export async function updateAlertStates(
  result: HealthRunResult,
): Promise<void> {
  for (const agent of result.agentResults) {
    for (const check of agent.checks) {
      const existing = await getAlertState(check.checkName);
      const isFailure = check.status !== 'healthy';

      await upsertAlertState({
        checkName: check.checkName,
        lastStatus: check.status,
        lastAlertAt: new Date().toISOString(),
        consecutiveFailures: isFailure
          ? (existing?.consecutiveFailures ?? 0) + 1
          : 0,
        resolvedAt: isFailure ? undefined : new Date().toISOString(),
      });
    }
  }
}

// --- Internal helpers ---

async function shouldSendUrgentAlert(
  unhealthyChecks: HealthCheckResult[],
): Promise<boolean> {
  // Check if any of these were already unhealthy in the last run
  // Only suppress if ALL unhealthy checks were already alerted within 12h
  for (const check of unhealthyChecks) {
    const state = await getAlertState(check.checkName);
    if (!state) return true; // New failure, always alert

    const hoursSinceAlert =
      (Date.now() - new Date(state.lastAlertAt).getTime()) / (1000 * 60 * 60);

    // Alert if last alert was >12h ago (since we run 2x daily)
    if (hoursSinceAlert > 12) return true;

    // Alert if this is a new failure (was previously healthy)
    if (state.lastStatus === 'healthy') return true;
  }

  return false;
}

function formatGroupLabel(group: string): string {
  switch (group) {
    case 'infrastructure':
      return '🔧 Infrastructure';
    case 'external':
      return '🌐 External Services';
    case 'business':
      return '📈 Business Logic';
    default:
      return group;
  }
}
