import { NextRequest, NextResponse } from 'next/server';
import { syncAllLeadsToOdoo, syncAllQuotesFromOdoo } from '@/lib/odoo-service';

// GET /api/odoo/cron
// Scheduled sync endpoint for Vercel Cron or external cron services
//
// This endpoint processes sync in batches to avoid timeout:
// - Pushes all pending leads (up to 50)
// - Pulls quotes for 10 leads per cron run (pagination handled automatically)
//
// Vercel Cron config in vercel.json:
// { "crons": [{ "path": "/api/odoo/cron", "schedule": "*/5 * * * *" }] }
export async function GET(request: NextRequest) {
  // Verify cron secret for security (REQUIRED in production)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is required
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    console.error('[Odoo Cron] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 }
    );
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Odoo Cron] Starting scheduled sync...');

    // Push pending leads first (this is already batched to 50)
    const pushResult = await syncAllLeadsToOdoo();
    console.log('[Odoo Cron] Push completed:', pushResult.message);

    // Pull quotes in a single batch (10 leads, oldest synced first)
    // Next cron run will pick up the next batch automatically
    const pullResult = await syncAllQuotesFromOdoo(10, 0);
    console.log('[Odoo Cron] Pull completed:', pullResult.message);

    const message = `Push: ${pushResult.message} | Pull: ${pullResult.message}`;
    console.log('[Odoo Cron] Sync completed:', message);

    return NextResponse.json({
      success: pushResult.success && pullResult.success,
      message,
      data: {
        push: pushResult.data,
        pull: pullResult.data,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Odoo Cron] Sync failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cron sync failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
