/**
 * Infrastructure Health Checks
 *
 * Implements 5 parallel infrastructure health checks:
 * - Database (Supabase Postgres)
 * - Auth (Supabase Auth)
 * - Storage (Supabase Storage buckets)
 * - Telegram (Bot API connectivity)
 * - Self-ping (Application endpoint health)
 *
 * Each check uses Promise.race with timeout and never throws errors.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { HealthCheckResult, HealthStatus } from '../types';

/**
 * Helper: Race a promise against a timeout
 * @throws {Error} with message "Timeout exceeded" if timeout occurs
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout exceeded')), timeoutMs)
    ),
  ]);
}

/**
 * Database Health Check
 * Tests: Connection, query execution, response time
 * Thresholds: <500ms healthy, <2s degraded, else unhealthy
 */
export async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const TIMEOUT_MS = 5000;

  try {
    const supabase = getSupabaseAdmin();

    const result = await withTimeout(
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      TIMEOUT_MS
    );

    const responseTimeMs = Date.now() - startTime;

    if (result.error) {
      return {
        checkName: 'database',
        serviceName: 'Supabase Postgres',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: result.error.message,
      };
    }

    let status: HealthStatus = 'healthy';
    if (responseTimeMs >= 2000) {
      status = 'unhealthy';
    } else if (responseTimeMs >= 500) {
      status = 'degraded';
    }

    return {
      checkName: 'database',
      serviceName: 'Supabase Postgres',
      status,
      responseTimeMs,
      metadata: {
        count: result.count ?? 0,
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      checkName: 'database',
      serviceName: 'Supabase Postgres',
      status: 'unhealthy',
      responseTimeMs,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Auth Service Health Check
 * Tests: Auth admin API connectivity and response time
 * Thresholds: Healthy if successful, degraded if >3s
 */
export async function checkAuth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const TIMEOUT_MS = 5000;

  try {
    const supabase = getSupabaseAdmin();

    const result = await withTimeout(
      supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
      TIMEOUT_MS
    );

    const responseTimeMs = Date.now() - startTime;

    if (result.error) {
      return {
        checkName: 'auth',
        serviceName: 'Supabase Auth',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: result.error.message,
      };
    }

    const status: HealthStatus = responseTimeMs >= 3000 ? 'degraded' : 'healthy';

    return {
      checkName: 'auth',
      serviceName: 'Supabase Auth',
      status,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      checkName: 'auth',
      serviceName: 'Supabase Auth',
      status: 'unhealthy',
      responseTimeMs,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Storage Health Check
 * Tests: Storage bucket listing and 'audio-notes' bucket existence
 * Thresholds: Healthy if bucket exists, degraded if >3s
 */
export async function checkStorage(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const TIMEOUT_MS = 5000;

  try {
    const supabase = getSupabaseAdmin();

    const result = await withTimeout(
      supabase.storage.listBuckets(),
      TIMEOUT_MS
    );

    const responseTimeMs = Date.now() - startTime;

    if (result.error) {
      return {
        checkName: 'storage',
        serviceName: 'Supabase Storage',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: result.error.message,
      };
    }

    const audioNotesBucket = result.data?.find(bucket => bucket.name === 'audio-notes');

    if (!audioNotesBucket) {
      return {
        checkName: 'storage',
        serviceName: 'Supabase Storage',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: 'audio-notes bucket not found',
      };
    }

    const status: HealthStatus = responseTimeMs >= 3000 ? 'degraded' : 'healthy';

    return {
      checkName: 'storage',
      serviceName: 'Supabase Storage',
      status,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      checkName: 'storage',
      serviceName: 'Supabase Storage',
      status: 'unhealthy',
      responseTimeMs,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Telegram Bot Health Check
 * Tests: Telegram Bot API connectivity and token validity
 * Thresholds: Healthy if bot responds, degraded if >3s
 */
export async function checkTelegram(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const TIMEOUT_MS = 5000;

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return {
        checkName: 'telegram',
        serviceName: 'Telegram Bot API',
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage: 'TELEGRAM_BOT_TOKEN not configured',
      };
    }

    const response = await withTimeout(
      fetch(`https://api.telegram.org/bot${token}/getMe`),
      TIMEOUT_MS
    );

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        checkName: 'telegram',
        serviceName: 'Telegram Bot API',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as { ok: boolean; result?: { username: string } };

    if (!data.ok) {
      return {
        checkName: 'telegram',
        serviceName: 'Telegram Bot API',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: 'Bot API returned ok=false',
      };
    }

    const status: HealthStatus = responseTimeMs >= 3000 ? 'degraded' : 'healthy';

    return {
      checkName: 'telegram',
      serviceName: 'Telegram Bot API',
      status,
      responseTimeMs,
      metadata: {
        botUsername: data.result?.username ?? 'unknown',
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      checkName: 'telegram',
      serviceName: 'Telegram Bot API',
      status: 'unhealthy',
      responseTimeMs,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Self-Ping Health Check
 * Tests: Application endpoint availability and response time
 * Thresholds: <2s healthy, >2s degraded, non-200 unhealthy
 */
export async function checkSelfPing(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const TIMEOUT_MS = 5000;

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      return {
        checkName: 'self-ping',
        serviceName: 'Application Endpoint',
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage: 'NEXT_PUBLIC_APP_URL not configured',
      };
    }

    const response = await withTimeout(
      fetch(`${appUrl}/api/health`, { method: 'HEAD' }),
      TIMEOUT_MS
    );

    const responseTimeMs = Date.now() - startTime;

    if (response.status !== 200) {
      return {
        checkName: 'self-ping',
        serviceName: 'Application Endpoint',
        status: 'unhealthy',
        responseTimeMs,
        errorMessage: `Expected 200, got ${response.status}`,
        metadata: {
          statusCode: response.status,
        },
      };
    }

    const status: HealthStatus = responseTimeMs >= 2000 ? 'degraded' : 'healthy';

    return {
      checkName: 'self-ping',
      serviceName: 'Application Endpoint',
      status,
      responseTimeMs,
      metadata: {
        statusCode: response.status,
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      checkName: 'self-ping',
      serviceName: 'Application Endpoint',
      status: 'unhealthy',
      responseTimeMs,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run All Infrastructure Checks in Parallel
 * Uses Promise.allSettled to ensure all checks complete regardless of failures
 * @returns Array of health check results for all infrastructure components
 */
export async function runInfrastructureChecks(): Promise<HealthCheckResult[]> {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkAuth(),
    checkStorage(),
    checkTelegram(),
    checkSelfPing(),
  ]);

  return checks.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    // This should never happen since all checks handle their own errors,
    // but provide a fallback just in case
    const checkNames = ['database', 'auth', 'storage', 'telegram', 'self-ping'];
    const serviceNames = [
      'Supabase Postgres',
      'Supabase Auth',
      'Supabase Storage',
      'Telegram Bot API',
      'Application Endpoint',
    ];

    return {
      checkName: checkNames[index] ?? 'unknown',
      serviceName: serviceNames[index] ?? 'Unknown Service',
      status: 'unhealthy' as HealthStatus,
      responseTimeMs: 0,
      errorMessage: result.reason instanceof Error ? result.reason.message : 'Unknown error',
    };
  });
}
