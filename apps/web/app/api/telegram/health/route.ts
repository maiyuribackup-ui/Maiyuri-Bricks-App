/**
 * Telegram Pipeline Health Check
 *
 * GET /api/telegram/health
 *
 * Comprehensive health check for the entire voice recording pipeline:
 * - Environment variable validation
 * - Telegram webhook status
 * - Database recording stats
 * - Railway worker status (if accessible)
 *
 * Use this endpoint for monitoring and alerting.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_ALLOWED_CHAT_IDS = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    env_vars: EnvVarCheck;
    telegram_webhook: WebhookCheck | null;
    database: DatabaseCheck | null;
    pipeline: PipelineCheck | null;
  };
  issues: string[];
  recommendations: string[];
}

interface EnvVarCheck {
  status: "ok" | "warning" | "error";
  details: Record<string, { set: boolean; valid: boolean; issue?: string }>;
}

interface WebhookCheck {
  status: "ok" | "warning" | "error";
  url: string | null;
  url_matches: boolean;
  pending_updates: number;
  last_error: string | null;
  last_error_age_hours: number | null;
}

interface DatabaseCheck {
  status: "ok" | "warning" | "error";
  connected: boolean;
  total_recordings: number;
  error?: string;
}

interface PipelineCheck {
  status: "ok" | "warning" | "error";
  recordings_24h: number;
  recordings_7d: number;
  pending_count: number;
  failed_count: number;
  avg_processing_time_minutes: number | null;
  last_recording_age_hours: number | null;
}

/**
 * Validate environment variable - check for corruption
 */
function validateEnvVar(
  value: string | undefined,
  name: string
): { set: boolean; valid: boolean; issue?: string } {
  if (!value) {
    return { set: false, valid: false, issue: "Not set" };
  }

  // Check for common corruption patterns
  if (value.includes("\n") || value.includes("\\n")) {
    return { set: true, valid: false, issue: "Contains newline characters" };
  }

  if (value.trim() !== value) {
    return { set: true, valid: false, issue: "Has leading/trailing whitespace" };
  }

  if (value === "undefined" || value === "null") {
    return { set: true, valid: false, issue: "Set to literal 'undefined' or 'null'" };
  }

  return { set: true, valid: true };
}

/**
 * Check all required environment variables
 */
function checkEnvVars(): EnvVarCheck {
  const vars = {
    TELEGRAM_BOT_TOKEN: validateEnvVar(TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN"),
    TELEGRAM_WEBHOOK_SECRET: validateEnvVar(TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET"),
    TELEGRAM_CHAT_ID: validateEnvVar(TELEGRAM_CHAT_ID, "TELEGRAM_CHAT_ID"),
    TELEGRAM_ALLOWED_CHAT_IDS: validateEnvVar(TELEGRAM_ALLOWED_CHAT_IDS, "TELEGRAM_ALLOWED_CHAT_IDS"),
    NEXT_PUBLIC_APP_URL: validateEnvVar(APP_URL, "NEXT_PUBLIC_APP_URL"),
    NEXT_PUBLIC_SUPABASE_URL: validateEnvVar(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: validateEnvVar(SUPABASE_SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  };

  const hasError = Object.values(vars).some((v) => !v.set || !v.valid);
  const hasCriticalError = !vars.TELEGRAM_BOT_TOKEN.valid || !vars.SUPABASE_SERVICE_ROLE_KEY.valid;

  return {
    status: hasCriticalError ? "error" : hasError ? "warning" : "ok",
    details: vars,
  };
}

/**
 * Check Telegram webhook status
 */
async function checkWebhook(): Promise<WebhookCheck | null> {
  if (!TELEGRAM_BOT_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return {
        status: "error",
        url: null,
        url_matches: false,
        pending_updates: 0,
        last_error: `Telegram API returned ${response.status}`,
        last_error_age_hours: null,
      };
    }

    const data = await response.json();
    const result = data.result;

    const expectedUrl = `${APP_URL}/api/telegram/webhook`;
    const urlMatches = result.url === expectedUrl;
    const hasPendingUpdates = (result.pending_update_count || 0) > 0;
    const hasRecentError = result.last_error_date != null;

    let lastErrorAgeHours: number | null = null;
    if (result.last_error_date) {
      const errorDate = new Date(result.last_error_date * 1000);
      lastErrorAgeHours = (Date.now() - errorDate.getTime()) / (1000 * 60 * 60);
    }

    // Determine status
    let status: "ok" | "warning" | "error" = "ok";
    if (!result.url || !urlMatches) {
      status = "error";
    } else if (hasRecentError && lastErrorAgeHours !== null && lastErrorAgeHours < 1) {
      status = "error"; // Error in last hour
    } else if (hasPendingUpdates || (hasRecentError && lastErrorAgeHours !== null && lastErrorAgeHours < 24)) {
      status = "warning";
    }

    return {
      status,
      url: result.url || null,
      url_matches: urlMatches,
      pending_updates: result.pending_update_count || 0,
      last_error: result.last_error_message || null,
      last_error_age_hours: lastErrorAgeHours ? Math.round(lastErrorAgeHours * 10) / 10 : null,
    };
  } catch (error) {
    return {
      status: "error",
      url: null,
      url_matches: false,
      pending_updates: 0,
      last_error: error instanceof Error ? error.message : "Unknown error",
      last_error_age_hours: null,
    };
  }
}

/**
 * Check database connection and stats
 */
async function checkDatabase(): Promise<DatabaseCheck | null> {
  try {
    const supabase = getSupabaseAdmin();

    // Simple count query to verify connection
    const { count, error } = await supabase
      .from("call_recordings")
      .select("*", { count: "exact", head: true });

    if (error) {
      return {
        status: "error",
        connected: false,
        total_recordings: 0,
        error: error.message,
      };
    }

    return {
      status: "ok",
      connected: true,
      total_recordings: count || 0,
    };
  } catch (error) {
    return {
      status: "error",
      connected: false,
      total_recordings: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check pipeline health - recording stats
 */
async function checkPipeline(): Promise<PipelineCheck | null> {
  try {
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get counts in parallel
    const [recordings24h, recordings7d, pending, failed, lastRecording] = await Promise.all([
      supabase
        .from("call_recordings")
        .select("*", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      supabase
        .from("call_recordings")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("call_recordings")
        .select("*", { count: "exact", head: true })
        .eq("processing_status", "pending"),
      supabase
        .from("call_recordings")
        .select("*", { count: "exact", head: true })
        .eq("processing_status", "failed"),
      supabase
        .from("call_recordings")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

    // Calculate last recording age
    let lastRecordingAgeHours: number | null = null;
    if (lastRecording.data?.created_at) {
      const lastDate = new Date(lastRecording.data.created_at);
      lastRecordingAgeHours = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
      lastRecordingAgeHours = Math.round(lastRecordingAgeHours * 10) / 10;
    }

    // Determine status
    let status: "ok" | "warning" | "error" = "ok";
    const pendingCount = pending.count || 0;
    const failedCount = failed.count || 0;

    if (failedCount > 5) {
      status = "error";
    } else if (pendingCount > 10 || failedCount > 0) {
      status = "warning";
    } else if (lastRecordingAgeHours !== null && lastRecordingAgeHours > 48) {
      status = "warning"; // No recordings in 2 days
    }

    return {
      status,
      recordings_24h: recordings24h.count || 0,
      recordings_7d: recordings7d.count || 0,
      pending_count: pendingCount,
      failed_count: failedCount,
      avg_processing_time_minutes: null, // Could add this later
      last_recording_age_hours: lastRecordingAgeHours,
    };
  } catch (error) {
    return {
      status: "error",
      recordings_24h: 0,
      recordings_7d: 0,
      pending_count: 0,
      failed_count: 0,
      avg_processing_time_minutes: null,
      last_recording_age_hours: null,
    };
  }
}

/**
 * GET /api/telegram/health
 */
export async function GET() {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Run all checks
  const envVars = checkEnvVars();
  const [webhook, database, pipeline] = await Promise.all([
    checkWebhook(),
    checkDatabase(),
    checkPipeline(),
  ]);

  // Collect issues and recommendations
  if (envVars.status !== "ok") {
    for (const [name, check] of Object.entries(envVars.details)) {
      if (!check.valid) {
        issues.push(`Env var ${name}: ${check.issue}`);
        recommendations.push(`Fix ${name} in Vercel environment variables`);
      }
    }
  }

  if (webhook) {
    if (!webhook.url) {
      issues.push("Telegram webhook URL is not set");
      recommendations.push("POST to /api/telegram/setup to register webhook");
    } else if (!webhook.url_matches) {
      issues.push(`Webhook URL mismatch: ${webhook.url}`);
      recommendations.push("POST to /api/telegram/setup to fix webhook URL");
    }
    if (webhook.pending_updates > 0) {
      issues.push(`${webhook.pending_updates} pending updates not delivered`);
      recommendations.push("Check webhook errors and fix configuration");
    }
    if (webhook.last_error && webhook.last_error_age_hours !== null && webhook.last_error_age_hours < 24) {
      issues.push(`Recent webhook error: ${webhook.last_error}`);
      recommendations.push("Check Vercel logs and fix webhook handler");
    }
  }

  if (database && database.status !== "ok") {
    issues.push(`Database error: ${database.error}`);
    recommendations.push("Check Supabase connection and credentials");
  }

  if (pipeline) {
    if (pipeline.failed_count > 0) {
      issues.push(`${pipeline.failed_count} failed recordings`);
      recommendations.push("Check Railway worker logs for processing errors");
    }
    if (pipeline.pending_count > 10) {
      issues.push(`${pipeline.pending_count} pending recordings (backlog)`);
      recommendations.push("Check if Railway worker is running");
    }
    if (pipeline.last_recording_age_hours !== null && pipeline.last_recording_age_hours > 48) {
      issues.push(`No recordings in ${Math.round(pipeline.last_recording_age_hours)} hours`);
      recommendations.push("Check if Telegram bot is receiving messages");
    }
  }

  // Determine overall status
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  const hasError =
    envVars.status === "error" ||
    webhook?.status === "error" ||
    database?.status === "error" ||
    pipeline?.status === "error";

  const hasWarning =
    envVars.status === "warning" ||
    webhook?.status === "warning" ||
    database?.status === "warning" ||
    pipeline?.status === "warning";

  if (hasError) {
    overallStatus = "unhealthy";
  } else if (hasWarning) {
    overallStatus = "degraded";
  }

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks: {
      env_vars: envVars,
      telegram_webhook: webhook,
      database: database,
      pipeline: pipeline,
    },
    issues,
    recommendations,
  };

  // Return appropriate HTTP status
  const httpStatus = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return NextResponse.json(healthStatus, { status: httpStatus });
}
