export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes max for Vercel Pro

import { NextRequest, NextResponse } from 'next/server';
import { runHealthCheck } from '@/lib/health/runner';
import type { RunType } from '@/lib/health/types';

/**
 * GET /api/health/cron
 *
 * Cron-triggered health check endpoint. Runs twice daily:
 * - 8:00 AM UTC (12:00 PM Dubai) → midday check
 * - 8:00 PM UTC (12:00 AM Dubai) → midnight check
 *
 * Also supports manual triggering with query params:
 * - ?type=morning|evening|manual (default: auto-detect from hour)
 *
 * Security: Requires CRON_SECRET in production.
 */
export async function GET(request: NextRequest) {
  return handleHealthCron(request);
}

// Also support POST for manual triggers (no auth required)
export async function POST(request: NextRequest) {
  return handleHealthCron(request);
}

async function handleHealthCron(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow manual triggers via POST without auth
  const isManualTrigger = request.method === 'POST';
  const requiresAuth = cronSecret && !isManualTrigger;

  if (!cronSecret && process.env.NODE_ENV === 'production' && !isManualTrigger) {
    console.error('[HealthCron] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 },
    );
  }

  if (requiresAuth && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Determine run type from query param or time of day
    const typeParam = request.nextUrl.searchParams.get('type');
    const runType = resolveRunType(typeParam);

    console.log(`[HealthCron] Starting ${runType} health check...`);

    const result = await runHealthCheck(runType);

    return NextResponse.json({
      success: true,
      runId: result.runId,
      runType: result.runType,
      overallStatus: result.overallStatus,
      aiDiagnosis: result.aiAnalysis?.diagnosis ?? null,
      totalChecks: result.agentResults.reduce(
        (sum, a) => sum + a.checks.length,
        0,
      ),
      healthyChecks: result.agentResults.reduce(
        (sum, a) => sum + a.checks.filter((c) => c.status === 'healthy').length,
        0,
      ),
      durationMs: result.totalDurationMs,
      timestamp: result.completedAt,
    });
  } catch (error) {
    console.error('[HealthCron] Health check failed:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

function resolveRunType(param: string | null): RunType {
  if (param === 'morning' || param === 'evening' || param === 'manual') {
    return param;
  }

  // Auto-detect from current UTC hour
  // 8 AM UTC = 12 PM Dubai (midday), 8 PM UTC = 12 AM Dubai (midnight)
  const utcHour = new Date().getUTCHours();

  if (utcHour >= 0 && utcHour < 14) {
    return 'morning'; // midday Dubai check
  }
  return 'evening'; // midnight Dubai check
}
