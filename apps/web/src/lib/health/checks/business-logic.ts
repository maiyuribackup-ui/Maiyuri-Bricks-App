/**
 * Business Logic Health Checks
 *
 * Runs 7 parallel health checks for business logic and data integrity:
 * 1. Stale leads detection
 * 2. Odoo sync error tracking
 * 3. Stuck call recordings
 * 4. Nudge delivery failures
 * 5. Smart quote health
 * 6. Knowledge embeddings queue
 * 7. Cron job freshness
 *
 * All checks are defensive and handle missing tables/columns gracefully.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { HealthCheckResult, HealthStatus } from '../types';
import { CRON_EXPECTED_INTERVALS, THRESHOLDS } from '../types';

/**
 * Helper to measure execution time
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return [result, duration];
}

/**
 * Helper to determine status based on count and thresholds
 */
function getStatusFromCount(
  count: number,
  degradedThreshold: number,
  unhealthyThreshold: number
): HealthStatus {
  if (count >= unhealthyThreshold) return 'unhealthy';
  if (count >= degradedThreshold) return 'degraded';
  return 'healthy';
}

/**
 * Helper to determine status based on percentage
 */
function getStatusFromPercent(
  percent: number,
  degradedThreshold: number,
  unhealthyThreshold: number
): HealthStatus {
  if (percent >= unhealthyThreshold) return 'unhealthy';
  if (percent >= degradedThreshold) return 'degraded';
  return 'healthy';
}

/**
 * Check 1: Stale Leads
 * Detects leads that haven't been updated in too long based on their status
 */
export async function checkStaleLeads(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Count hot leads stale for 3+ days
      const { count: hotStale, error: hotError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'hot')
        .lt('updated_at', threeDaysAgo);

      if (hotError) throw hotError;

      // Count follow_up leads stale for 7+ days
      const { count: followupStale, error: followupError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'follow_up')
        .lt('updated_at', sevenDaysAgo);

      if (followupError) throw followupError;

      return {
        hotStale: hotStale ?? 0,
        followupStale: followupStale ?? 0,
      };
    });

    const totalStale = result.hotStale + result.followupStale;
    const status = getStatusFromCount(
      totalStale,
      THRESHOLDS.staleLeads.degradedCount,
      THRESHOLDS.staleLeads.unhealthyCount
    );

    return {
      checkName: 'stale-leads',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        hot_stale: result.hotStale,
        followup_stale: result.followupStale,
        total_stale: totalStale,
      },
    };
  } catch (error) {
    return {
      checkName: 'stale-leads',
      serviceName: 'Business Logic',
      status: 'unhealthy',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check 2: Odoo Sync Errors
 * Monitors sync error logs from production and delivery syncs
 */
export async function checkOdooSyncErrors(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let totalErrors = 0;

      // Check production_sync_log errors (try both created_at and started_at)
      try {
        const { count: prodErrors, error: prodError } = await supabase
          .from('production_sync_log')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'error')
          .gte('created_at', oneDayAgo);

        if (!prodError && prodErrors !== null) {
          totalErrors += prodErrors;
        } else {
          // Try with started_at if created_at doesn't exist
          const { count: prodErrors2, error: prodError2 } = await supabase
            .from('production_sync_log')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'error')
            .gte('started_at', oneDayAgo);

          if (!prodError2 && prodErrors2 !== null) {
            totalErrors += prodErrors2;
          }
        }
      } catch {
        // Table might not exist, continue
      }

      // Check delivery_sync_log errors (defensive)
      try {
        const { count: deliveryErrors, error: deliveryError } = await supabase
          .from('delivery_sync_log')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'error')
          .gte('created_at', oneDayAgo);

        if (!deliveryError && deliveryErrors !== null) {
          totalErrors += deliveryErrors;
        } else {
          // Try with started_at
          const { count: deliveryErrors2, error: deliveryError2 } = await supabase
            .from('delivery_sync_log')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'error')
            .gte('started_at', oneDayAgo);

          if (!deliveryError2 && deliveryErrors2 !== null) {
            totalErrors += deliveryErrors2;
          }
        }
      } catch {
        // Table might not exist, continue
      }

      return totalErrors;
    });

    const status = getStatusFromCount(
      result,
      THRESHOLDS.syncErrors.degradedCount,
      THRESHOLDS.syncErrors.unhealthyCount
    );

    return {
      checkName: 'odoo-sync-errors',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        error_count: result,
      },
    };
  } catch (error) {
    return {
      checkName: 'odoo-sync-errors',
      serviceName: 'Business Logic',
      status: 'degraded',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check 3: Stuck Call Recordings
 * Detects recordings stuck in pending status for over 1 hour
 */
export async function checkStuckRecordings(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data, count, error } = await supabase
        .from('call_recordings')
        .select('created_at', { count: 'exact' })
        .eq('processing_status', 'pending')
        .lt('created_at', oneHourAgo)
        .order('created_at', { ascending: true })
        .limit(1);

      if (error) throw error;

      const stuckCount = count ?? 0;
      let oldestAgeMinutes: number | undefined;

      if (data && data.length > 0 && data[0]?.created_at) {
        const oldestDate = new Date(data[0].created_at);
        oldestAgeMinutes = Math.floor((Date.now() - oldestDate.getTime()) / (60 * 1000));
      }

      return { stuckCount, oldestAgeMinutes };
    });

    const status = getStatusFromCount(
      result.stuckCount,
      THRESHOLDS.stuckRecordings.degradedCount,
      THRESHOLDS.stuckRecordings.unhealthyCount
    );

    return {
      checkName: 'stuck-recordings',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        stuck_count: result.stuckCount,
        oldest_age_minutes: result.oldestAgeMinutes,
      },
    };
  } catch (error) {
    return {
      checkName: 'stuck-recordings',
      serviceName: 'Business Logic',
      status: 'degraded',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check 4: Nudge Delivery Health
 * Monitors nudge failure rate in last 24 hours
 */
export async function checkNudgeDelivery(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Count total nudges
      const { count: totalNudges, error: totalError } = await supabase
        .from('nudge_history')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      if (totalError) throw totalError;

      const total = totalNudges ?? 0;
      if (total === 0) {
        return { total: 0, failed: 0, failureRate: 0 };
      }

      // Count failed nudges (try both status='failed' and delivered=false)
      let failed = 0;

      try {
        const { count: failedCount, error: failedError } = await supabase
          .from('nudge_history')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', oneDayAgo)
          .eq('status', 'failed');

        if (!failedError && failedCount !== null) {
          failed = failedCount;
        }
      } catch {
        // Try delivered=false approach
        try {
          const { count: failedCount, error: failedError } = await supabase
            .from('nudge_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneDayAgo)
            .eq('delivered', false);

          if (!failedError && failedCount !== null) {
            failed = failedCount;
          }
        } catch {
          // Can't determine failures, assume 0
        }
      }

      const failureRate = (failed / total) * 100;
      return { total, failed, failureRate };
    });

    const status =
      result.total === 0
        ? 'healthy'
        : getStatusFromPercent(
            result.failureRate,
            THRESHOLDS.nudgeFailure.degradedPercent,
            THRESHOLDS.nudgeFailure.unhealthyPercent
          );

    return {
      checkName: 'nudge-delivery',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        total: result.total,
        failed: result.failed,
        failure_rate: result.failureRate,
      },
    };
  } catch (error) {
    return {
      checkName: 'nudge-delivery',
      serviceName: 'Business Logic',
      status: 'degraded',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check 5: Smart Quote Health
 * Monitors smart quote failure rate in last 24 hours
 */
export async function checkSmartQuoteHealth(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Count total quotes
      const { count: totalQuotes, error: totalError } = await supabase
        .from('smart_quotes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      if (totalError) throw totalError;

      const total = totalQuotes ?? 0;
      if (total === 0) {
        return { total: 0, failed: 0, failureRate: 0 };
      }

      // Count failed quotes (defensive - check for status='failed' or error field)
      let failed = 0;

      try {
        const { count: failedCount, error: failedError } = await supabase
          .from('smart_quotes')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', oneDayAgo)
          .eq('status', 'failed');

        if (!failedError && failedCount !== null) {
          failed = failedCount;
        }
      } catch {
        // Try checking for error field existence
        try {
          const { count: failedCount, error: failedError } = await supabase
            .from('smart_quotes')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneDayAgo)
            .not('error', 'is', null);

          if (!failedError && failedCount !== null) {
            failed = failedCount;
          }
        } catch {
          // Can't determine failures, assume 0
        }
      }

      const failureRate = (failed / total) * 100;
      return { total, failed, failureRate };
    });

    const status =
      result.total === 0
        ? 'healthy'
        : getStatusFromPercent(
            result.failureRate,
            THRESHOLDS.quoteFailure.degradedPercent,
            THRESHOLDS.quoteFailure.unhealthyPercent
          );

    return {
      checkName: 'smart-quote-health',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        total: result.total,
        failed: result.failed,
        failure_rate: result.failureRate,
      },
    };
  } catch (error) {
    return {
      checkName: 'smart-quote-health',
      serviceName: 'Business Logic',
      status: 'degraded',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check 6: Knowledge Embeddings Queue
 * Detects items stuck in the pending embeddings queue
 */
export async function checkKnowledgeEmbeddings(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let stuckCount = 0;

      // Try knowledgebase_pending first
      try {
        const { count, error } = await supabase
          .from('knowledgebase_pending')
          .select('*', { count: 'exact', head: true })
          .lt('created_at', oneDayAgo);

        if (!error && count !== null) {
          stuckCount = count;
        }
      } catch {
        // Try knowledge_pending
        try {
          const { count, error } = await supabase
            .from('knowledge_pending')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', oneDayAgo);

          if (!error && count !== null) {
            stuckCount = count;
          }
        } catch {
          // Table doesn't exist, assume 0 stuck
          stuckCount = 0;
        }
      }

      return stuckCount;
    });

    const status = getStatusFromCount(
      result,
      THRESHOLDS.embeddingStuck.degradedCount,
      THRESHOLDS.embeddingStuck.unhealthyCount
    );

    return {
      checkName: 'knowledge-embeddings',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        stuck_count: result,
      },
    };
  } catch (error) {
    return {
      checkName: 'knowledge-embeddings',
      serviceName: 'Business Logic',
      status: 'degraded',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check 7: Cron Job Freshness
 * Ensures all cron jobs are running on schedule
 */
export async function checkCronFreshness(): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();

  try {
    const [result, responseTimeMs] = await measureTime(async () => {
      const cronNames = Object.keys(CRON_EXPECTED_INTERVALS);
      const freshnessDetails: Record<
        string,
        { lastRun: string | null; hoursSince: number | null; isStale: boolean }
      > = {};
      let staleCount = 0;

      for (const cronName of cronNames) {
        const expectedIntervalHours = CRON_EXPECTED_INTERVALS[cronName];
        if (!expectedIntervalHours) continue;

        try {
          const { data, error } = await supabase
            .from('cron_execution_log')
            .select('completed_at')
            .eq('cron_name', cronName)
            .eq('status', 'success')
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;

          const lastRun = data?.completed_at ?? null;
          let hoursSince: number | null = null;
          let isStale = false;

          if (lastRun) {
            const lastRunDate = new Date(lastRun);
            hoursSince = (Date.now() - lastRunDate.getTime()) / (60 * 60 * 1000);
            isStale = hoursSince > expectedIntervalHours * 2;
          } else {
            // No successful run found, consider stale
            isStale = true;
          }

          freshnessDetails[cronName] = { lastRun, hoursSince, isStale };
          if (isStale) staleCount++;
        } catch {
          // Error querying this cron, mark as stale
          freshnessDetails[cronName] = { lastRun: null, hoursSince: null, isStale: true };
          staleCount++;
        }
      }

      // Check if cron_execution_log is completely empty (new system)
      const { count: totalCrons } = await supabase
        .from('cron_execution_log')
        .select('*', { count: 'exact', head: true });

      const isEmptyLog = totalCrons === 0;

      return { staleCount, freshnessDetails, isEmptyLog };
    });

    // If log is empty, return healthy with a note
    if (result.isEmptyLog) {
      return {
        checkName: 'cron-freshness',
        serviceName: 'Business Logic',
        status: 'healthy',
        responseTimeMs,
        metadata: {
          note: 'Cron execution log is empty - no data yet',
          stale_count: 0,
        },
      };
    }

    const status = getStatusFromCount(
      result.staleCount,
      THRESHOLDS.cronFreshness.degradedStale,
      THRESHOLDS.cronFreshness.unhealthyStale
    );

    return {
      checkName: 'cron-freshness',
      serviceName: 'Business Logic',
      status,
      responseTimeMs,
      metadata: {
        stale_count: result.staleCount,
        freshness_details: result.freshnessDetails,
      },
    };
  } catch (error) {
    return {
      checkName: 'cron-freshness',
      serviceName: 'Business Logic',
      status: 'degraded',
      responseTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run all business logic checks in parallel
 */
export async function runBusinessLogicChecks(): Promise<HealthCheckResult[]> {
  const results = await Promise.all([
    checkStaleLeads(),
    checkOdooSyncErrors(),
    checkStuckRecordings(),
    checkNudgeDelivery(),
    checkSmartQuoteHealth(),
    checkKnowledgeEmbeddings(),
    checkCronFreshness(),
  ]);

  return results;
}
