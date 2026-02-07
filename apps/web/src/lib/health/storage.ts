/**
 * Health Check Storage
 *
 * Persists health check results and AI analysis to Supabase.
 * Queries historical data for comparison and trending.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type {
  HealthRunResult,
  AgentGroupResult,
  HealthCheckResult,
  AIAnalysis,
  AlertState,
  RunType,
} from './types';

/**
 * Save all results from a health check run
 */
export async function saveRunResults(result: HealthRunResult): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Flatten all check results with run metadata
  const rows = result.agentResults.flatMap((agent) =>
    agent.checks.map((check) => ({
      run_id: result.runId,
      run_type: result.runType,
      agent_group: agent.group,
      check_name: check.checkName,
      service_name: check.serviceName,
      status: check.status,
      response_time_ms: Math.round(check.responseTimeMs),
      error_message: check.errorMessage ?? null,
      metadata: check.metadata ?? {},
      checked_at: result.completedAt,
    })),
  );

  if (rows.length > 0) {
    const { error } = await supabase
      .from('health_check_results')
      .insert(rows);

    if (error) {
      console.error('[HealthCheck] Failed to save results:', error.message);
    }
  }
}

/**
 * Save AI analysis for a run
 */
export async function saveAIAnalysis(
  runId: string,
  analysis: AIAnalysis,
  rawPrompt: string,
  rawResponse: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('health_ai_analysis').insert({
    run_id: runId,
    overall_status: analysis.overallStatus,
    diagnosis: analysis.diagnosis,
    correlations: analysis.correlations ?? null,
    action_items: analysis.actionItems ?? null,
    business_impact: analysis.businessImpact ?? null,
    raw_prompt: rawPrompt,
    raw_response: rawResponse,
  });

  if (error) {
    console.error('[HealthCheck] Failed to save AI analysis:', error.message);
  }
}

/**
 * Get the last run's results for comparison
 */
export async function getLastRunResults(): Promise<HealthCheckResult[] | null> {
  const supabase = getSupabaseAdmin();

  // Find the most recent run_id
  const { data: lastRun } = await supabase
    .from('health_check_results')
    .select('run_id')
    .order('checked_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastRun?.run_id) return null;

  // Get all results for that run
  const { data } = await supabase
    .from('health_check_results')
    .select('*')
    .eq('run_id', lastRun.run_id)
    .order('check_name');

  if (!data) return null;

  return data.map((row) => ({
    checkName: row.check_name,
    serviceName: row.service_name,
    status: row.status,
    responseTimeMs: row.response_time_ms ?? 0,
    errorMessage: row.error_message ?? undefined,
    metadata: row.metadata ?? undefined,
  }));
}

/**
 * Get alert state for a check
 */
export async function getAlertState(
  checkName: string,
): Promise<AlertState | null> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from('health_alert_state')
    .select('*')
    .eq('check_name', checkName)
    .single();

  if (!data) return null;

  return {
    checkName: data.check_name,
    lastStatus: data.last_status,
    lastAlertAt: data.last_alert_at,
    consecutiveFailures: data.consecutive_failures ?? 0,
    resolvedAt: data.resolved_at ?? undefined,
  };
}

/**
 * Update alert state for a check
 */
export async function upsertAlertState(state: AlertState): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('health_alert_state').upsert(
    {
      check_name: state.checkName,
      last_status: state.lastStatus,
      last_alert_at: state.lastAlertAt,
      consecutive_failures: state.consecutiveFailures,
      resolved_at: state.resolvedAt ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'check_name' },
  );

  if (error) {
    console.error('[HealthCheck] Failed to upsert alert state:', error.message);
  }
}

/**
 * Clean up old results (keep 30 days)
 */
export async function cleanupOldResults(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count } = await supabase
    .from('health_check_results')
    .delete({ count: 'exact' })
    .lt('checked_at', thirtyDaysAgo);

  // Also clean old AI analyses
  await supabase
    .from('health_ai_analysis')
    .delete()
    .lt('analyzed_at', thirtyDaysAgo);

  // Clean old cron logs
  await supabase
    .from('cron_execution_log')
    .delete()
    .lt('started_at', thirtyDaysAgo);

  return count ?? 0;
}
