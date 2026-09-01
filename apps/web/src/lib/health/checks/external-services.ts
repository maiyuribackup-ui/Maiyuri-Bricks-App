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
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { HealthCheckResult, THRESHOLDS } from '../types';
import { getHealthModels, getWorkerPipelineStatus } from '../policy';

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
    // Get configuration from environment. No fallback host: probing a
    // hardcoded default reports on infrastructure the app does not use, which
    // is how a dead crm.maiyuri.com default kept this check meaningful-looking.
    const odooUrl = process.env.ODOO_URL;
    if (!odooUrl) {
      throw new Error('ODOO_URL is not configured');
    }
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
        endpoint: process.env.ODOO_URL
          ? `${process.env.ODOO_URL}/xmlrpc/2/common`
          : 'ODOO_URL not configured',
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

    const model = getHealthModels().anthropic;
    const checkPromise = anthropic.messages.create({
      model,
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

    const modelName = getHealthModels().gemini;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

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
        model: modelName,
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
 * Check email delivery (Gmail SMTP — switched from Resend).
 *
 * transporter.verify() performs the SMTP handshake + auth without sending.
 */
export async function checkResend(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = 'resend'; // keep the historic check name for continuity in logs
  const serviceName = 'Email (Gmail SMTP)';

  try {
    const user = process.env.GMAIL_SMTP_USER;
    const pass = process.env.GMAIL_SMTP_APP_PASSWORD;

    if (!user || !pass) {
      return {
        checkName,
        serviceName,
        status: 'unhealthy',
        responseTimeMs: 0,
        errorMessage:
          'Not configured - GMAIL_SMTP_USER / GMAIL_SMTP_APP_PASSWORD missing',
      };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    await withTimeout(transporter.verify(), THRESHOLDS.resend.timeoutMs);
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

    // Actionable queue: pending and retryable failed recordings. Permanent
    // historical failures remain visible but do not define live worker health.
    const { count: actionableQueueCount, error: queueError } = await supabase
      .from('call_recordings')
      .select('*', { count: 'exact', head: true })
      .in('processing_status', ['pending', 'failed'])
      .neq('phone_number', 'PENDING')
      .lt('retry_count', 3);

    if (queueError) throw queueError;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentFailureCount, error: recentFailureError } = await supabase
      .from('call_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('processing_status', 'failed')
      .neq('phone_number', 'PENDING')
      .lt('retry_count', 3)
      .gte('updated_at', oneDayAgo);

    if (recentFailureError) throw recentFailureError;

    const { count: permanentFailureCount, error: permanentFailureError } = await supabase
      .from('call_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('processing_status', 'failed')
      .gte('retry_count', 3);

    if (permanentFailureError) throw permanentFailureError;

    // Get oldest pending recording to show live queue staleness.
    const { data: oldestPending, error: oldestError } = await supabase
      .from('call_recordings')
      .select('created_at')
      .eq('processing_status', 'pending')
      .neq('phone_number', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    const oldestAge = oldestPending && !oldestError
      ? Date.now() - new Date(oldestPending.created_at).getTime()
      : null;
    const responseTimeMs = Date.now() - startTime;
    const counts = {
      actionableQueueCount: actionableQueueCount ?? 0,
      recentFailureCount: recentFailureCount ?? 0,
      permanentFailureCount: permanentFailureCount ?? 0,
    };
    const status = getWorkerPipelineStatus(counts);

    return {
      checkName,
      serviceName,
      status,
      responseTimeMs,
      metadata: {
        ...counts,
        // Transitional aliases for dashboards built against the v1 metadata
        // shape. Their values now represent the live/actionable equivalents.
        pendingCount: counts.actionableQueueCount,
        failedCount: counts.recentFailureCount,
        metadataSchemaVersion: 2,
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
