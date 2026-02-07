/**
 * Cron Execution Logger
 *
 * Lightweight helper to log cron job executions for freshness monitoring.
 * Add to existing cron endpoints with minimal code changes.
 *
 * Usage:
 *   const cronLog = await startCronLog('odoo-sync');
 *   try {
 *     // ... existing cron logic ...
 *     await cronLog.success();
 *   } catch (error) {
 *     await cronLog.fail(error instanceof Error ? error.message : 'Unknown error');
 *     throw error;
 *   }
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface CronLogHandle {
  /** Mark the cron as successfully completed */
  success: () => Promise<void>;
  /** Mark the cron as failed with an error message */
  fail: (errorMessage: string) => Promise<void>;
}

/**
 * Start logging a cron execution. Returns a handle to mark success/failure.
 */
export async function startCronLog(cronName: string): Promise<CronLogHandle> {
  const supabase = getSupabaseAdmin();
  const startedAt = new Date();

  const { data } = await supabase
    .from('cron_execution_log')
    .insert({
      cron_name: cronName,
      started_at: startedAt.toISOString(),
      status: 'running',
    })
    .select('id')
    .single();

  const logId = data?.id;

  return {
    success: async () => {
      if (!logId) return;
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      await supabase
        .from('cron_execution_log')
        .update({
          completed_at: completedAt.toISOString(),
          status: 'success',
          duration_ms: durationMs,
        })
        .eq('id', logId);
    },
    fail: async (errorMessage: string) => {
      if (!logId) return;
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      await supabase
        .from('cron_execution_log')
        .update({
          completed_at: completedAt.toISOString(),
          status: 'failed',
          duration_ms: durationMs,
          error_message: errorMessage,
        })
        .eq('id', logId);
    },
  };
}
