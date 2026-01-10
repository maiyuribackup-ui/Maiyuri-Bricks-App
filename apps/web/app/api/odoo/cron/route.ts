import { NextRequest, NextResponse } from 'next/server';
import { fullSync } from '@/lib/odoo-service';

// GET /api/odoo/cron
// Scheduled sync endpoint for Vercel Cron or external cron services
//
// This endpoint should be called periodically (e.g., every 15 minutes)
// to keep Odoo and the app in sync.
//
// Vercel Cron config in vercel.json:
// { "crons": [{ "path": "/api/odoo/cron", "schedule": "*/15 * * * *" }] }
export async function GET(request: NextRequest) {
  // Verify cron secret for security (optional but recommended)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Odoo Cron] Starting scheduled sync...');

    const result = await fullSync();

    console.log('[Odoo Cron] Sync completed:', result.message);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data,
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
