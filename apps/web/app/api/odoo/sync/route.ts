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
 * Body: {
 *   type: 'full' | 'push' | 'pull',
 *   limit?: number (default 10 for pull, 50 for push),
 *   offset?: number (for pagination)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const syncType = body.type || 'full';
    const limit = typeof body.limit === 'number' ? body.limit : 10;
    const offset = typeof body.offset === 'number' ? body.offset : 0;

    let result;

    switch (syncType) {
      case 'push':
        result = await syncAllLeadsToOdoo();
        break;
      case 'pull':
        result = await syncAllQuotesFromOdoo(limit, offset);
        break;
      case 'full':
      default:
        result = await fullSync(limit, offset);
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
      fullSync: 'POST /api/odoo/sync { type: "full", limit?: 10, offset?: 0 }',
      pushLeads: 'POST /api/odoo/sync { type: "push" }',
      pullQuotes: 'POST /api/odoo/sync { type: "pull", limit?: 10, offset?: 0 }',
      syncLead: 'POST /api/odoo/sync/[leadId]',
    },
    notes: {
      batching: 'Pull sync processes leads in batches to avoid timeout',
      pagination: 'Use limit/offset for pagination. Response includes hasMore and nextOffset',
      concurrency: 'Leads are processed 5 at a time within each batch',
    },
  });
}
