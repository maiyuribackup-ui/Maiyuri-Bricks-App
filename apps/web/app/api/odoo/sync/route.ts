import { NextRequest, NextResponse } from 'next/server';
import {
  fullSync,
  syncAllLeadsToOdoo,
  syncAllQuotesFromOdoo,
} from '@/lib/odoo-service';

/**
 * POST /api/odoo/sync
 * Trigger Odoo synchronization
 *
 * Body: { type: 'full' | 'push' | 'pull' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const syncType = body.type || 'full';

    let result;

    switch (syncType) {
      case 'push':
        result = await syncAllLeadsToOdoo();
        break;
      case 'pull':
        result = await syncAllQuotesFromOdoo();
        break;
      case 'full':
      default:
        result = await fullSync();
        break;
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Odoo sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/odoo/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    endpoints: {
      fullSync: 'POST /api/odoo/sync { type: "full" }',
      pushLeads: 'POST /api/odoo/sync { type: "push" }',
      pullQuotes: 'POST /api/odoo/sync { type: "pull" }',
      syncLead: 'POST /api/odoo/sync/[leadId]',
    },
  });
}
