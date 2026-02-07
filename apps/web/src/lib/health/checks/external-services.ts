/**
 * External Services Health Checks
 *
 * This module implements health checks for external services that the application depends on.
 * All checks run in parallel with proper timeout handling and graceful error recovery.
 *
 * Services monitored:
 * - Odoo CRM (XML-RPC API)
 * - Anthropic AI (Claude API)
 * - Gemini AI (Google Generative AI API)
 * - Resend (Email delivery)
 * - Worker Pipeline (Call recording processing)
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { HealthCheckResult, THRESHOLDS } from '../types';

/**
 * Helper function to race a promise against a timeout
 * @throws {Error} If timeout is reached before promise resolves
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Check Odoo CRM availability via XML-RPC version endpoint
 *
 * This check validates that the Odoo CRM system is accessible without requiring authentication.
 * We call the version method on the common endpoint which returns server version info.
 */
export async function checkOdoo(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = 'odoo';
  const serviceName = 'Odoo CRM';

  try {
    // Get configuration from environment
    const odooUrl = process.env.ODOO_URL || 'https://CRM.MAIYURI.COM';
    const endpoint = `${odooUrl}/xmlrpc/2/common`;

    // Build XML-RPC request for version method (no auth required)
    const xmlBody = '<?xml version="1.0"?><methodCall><methodName>version</methodName></methodCall>';

    const checkPromise = fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: xmlBody,
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();

      // Parse version from XML response if available
      const versionMatch = responseText.match(/<string>([^<]+)<\/string>/);
      const version = versionMatch?.[1];

      return {
        success: true,
        version,
      };
    });

    const result = await withTimeout(checkPromise, THRESHOLDS.odoo.timeoutMs);
    const responseTimeMs = Date.now() - startTime;

    // Determine health status based on response time
    const status =
      responseTimeMs > THRESHOLDS.odoo.degradedMs ? 'degraded' : 'healthy';

    return {
      checkName,
      serviceName,
      status,
      responseTimeMs,
      metadata: {
        endpoint,
        version: result.version,
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Timeout or connection errors indicate unhealthy state
    return {
      checkName,
      serviceName,
      status: 'unhealthy',
      responseTimeMs,
      errorMessage,
      metadata: {
        endpoint: `${process.env.ODOO_URL || 'https://CRM.MAIYURI.COM'}/xmlrpc/2/common`,
      },
    };
  }
}

/**
 * Check Anthropic API (Claude) availability
 *
 * Makes a minimal API call to validate the API key and service availability.
 * Uses the smallest, fastest model with minimal token usage.
 */
export async function checkAnthropic(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = 'anthropic';
  const serviceName = 'Anthropic API (Claude)';

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        checkName,
        serviceName,
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage: 'Not configured - ANTHROPIC_API_KEY missing',
      };
    }

    const anthropic = new Anthropic({ apiKey });

    const checkPromise = anthropic.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const response = await withTimeout(checkPromise, THRESHOLDS.anthropic.timeoutMs);
    const responseTimeMs = Date.now() - startTime;

    // Check for rate limiting (429 status)
    // Note: The SDK doesn't expose HTTP status directly, but rate limit errors
    // would throw, so reaching here means success

    const status =
      responseTimeMs > THRESHOLDS.anthropic.degradedMs ? 'degraded' : 'healthy';

    return {
      checkName,
      serviceName,
      status,
      responseTimeMs,
      metadata: {
        model: response.model,
        usage: response.usage,
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if error is rate limiting
    const isRateLimit = errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit');

    return {
      checkName,
      serviceName,
      status: isRateLimit ? 'degraded' : 'unhealthy',
      responseTimeMs,
      errorMessage,
    };
  }
}

/**
 * Check Google Gemini API availability
 *
 * Makes a minimal content generation call to validate the API key and service.
 */
export async function checkGemini(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = 'gemini';
  const serviceName = 'Google Gemini AI';

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      return {
        checkName,
        serviceName,
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage: 'Not configured - GOOGLE_AI_API_KEY missing',
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const checkPromise = model.generateContent('hi');

    const response = await withTimeout(checkPromise, THRESHOLDS.gemini.timeoutMs);
    const responseTimeMs = Date.now() - startTime;

    const status =
      responseTimeMs > THRESHOLDS.gemini.degradedMs ? 'degraded' : 'healthy';

    return {
      checkName,
      serviceName,
      status,
      responseTimeMs,
      metadata: {
        model: 'gemini-2.0-flash-lite',
        response: response.response.text().substring(0, 50), // First 50 chars
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      checkName,
      serviceName,
      status: 'unhealthy',
      responseTimeMs,
      errorMessage,
    };
  }
}

/**
 * Check Resend email service availability
 *
 * Validates the API key by listing API keys (lightweight operation).
 */
export async function checkResend(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = 'resend';
  const serviceName = 'Resend Email';

  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return {
        checkName,
        serviceName,
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage: 'Not configured - RESEND_API_KEY missing',
      };
    }

    const resend = new Resend(apiKey);

    const checkPromise = resend.apiKeys.list();

    await withTimeout(checkPromise, THRESHOLDS.resend.timeoutMs);
    const responseTimeMs = Date.now() - startTime;

    const status =
      responseTimeMs > THRESHOLDS.resend.degradedMs ? 'degraded' : 'healthy';

    return {
      checkName,
      serviceName,
      status,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      checkName,
      serviceName,
      status: 'unhealthy',
      responseTimeMs,
      errorMessage,
    };
  }
}

/**
 * Check Worker Pipeline health
 *
 * Monitors the call recording processing pipeline by checking:
 * - Number of pending recordings
 * - Number of failed recordings
 * - Age of oldest pending recording
 *
 * Thresholds from THRESHOLDS.worker:
 * - Healthy: <5 pending, 0 failed
 * - Degraded: 5-20 pending OR 1-2 failed
 * - Unhealthy: >20 pending OR >2 failed
 */
export async function checkWorkerPipeline(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = 'worker-pipeline';
  const serviceName = 'Worker Pipeline';

  try {
    const supabase = getSupabaseAdmin();

    // Query for pending recordings
    const { count: pendingCount, error: pendingError } = await supabase
      .from('call_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('processing_status', 'pending');

    if (pendingError) throw pendingError;

    // Query for failed recordings
    const { count: failedCount, error: failedError } = await supabase
      .from('call_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('processing_status', 'failed');

    if (failedError) throw failedError;

    // Get oldest pending recording to check staleness
    const { data: oldestPending, error: oldestError } = await supabase
      .from('call_recordings')
      .select('created_at')
      .eq('processing_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    // Don't throw if no pending records found
    const oldestAge = oldestPending && !oldestError
      ? Date.now() - new Date(oldestPending.created_at).getTime()
      : null;

    const responseTimeMs = Date.now() - startTime;

    // Determine health status based on thresholds
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    const pending = pendingCount ?? 0;
    const failed = failedCount ?? 0;

    if (
      pending > THRESHOLDS.worker.unhealthyPending ||
      failed > THRESHOLDS.worker.unhealthyFailed
    ) {
      status = 'unhealthy';
    } else if (
      pending >= THRESHOLDS.worker.degradedPending ||
      failed >= THRESHOLDS.worker.degradedFailed
    ) {
      status = 'degraded';
    }

    return {
      checkName,
      serviceName,
      status,
      responseTimeMs,
      metadata: {
        pendingCount: pending,
        failedCount: failed,
        oldestPendingAgeMs: oldestAge,
        oldestPendingAgeHours: oldestAge ? (oldestAge / (1000 * 60 * 60)).toFixed(1) : null,
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      checkName,
      serviceName,
      status: 'unhealthy',
      responseTimeMs,
      errorMessage,
    };
  }
}

/**
 * Run all external service health checks in parallel
 *
 * This is the main orchestration function that executes all checks concurrently
 * and returns the aggregated results.
 */
export async function runExternalServicesChecks(): Promise<HealthCheckResult[]> {
  // Execute all checks in parallel for maximum performance
  const results = await Promise.all([
    checkOdoo(),
    checkAnthropic(),
    checkGemini(),
    checkResend(),
    checkWorkerPipeline(),
  ]);

  return results;
}
