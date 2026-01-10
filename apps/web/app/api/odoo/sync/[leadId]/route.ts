import { NextRequest, NextResponse } from 'next/server';
import { pushLeadToOdoo, pullQuotesFromOdoo } from '@/lib/odoo-service';

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

/**
 * POST /api/odoo/sync/[leadId]
 * Sync a specific lead with Odoo
 *
 * Body: { action: 'push' | 'pull' | 'both' }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'both';

    const results: Record<string, unknown> = {};

    if (action === 'push' || action === 'both') {
      results.push = await pushLeadToOdoo(leadId);
    }

    if (action === 'pull' || action === 'both') {
      results.pull = await pullQuotesFromOdoo(leadId);
    }

    const success = Object.values(results).every(
      (r) => (r as { success: boolean }).success
    );

    return NextResponse.json({
      success,
      leadId,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Lead sync error:', error);
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
 * GET /api/odoo/sync/[leadId]
 * Get sync status for a specific lead
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadId } = await params;

    // Import Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: lead, error } = await supabase
      .from('leads')
      .select(
        'id, name, odoo_lead_id, odoo_partner_id, odoo_quote_number, odoo_order_number, odoo_quote_amount, odoo_order_amount, odoo_synced_at, odoo_sync_status'
      )
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Get recent sync logs
    const { data: logs } = await supabase
      .from('odoo_sync_log')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        odoo: {
          leadId: lead.odoo_lead_id,
          partnerId: lead.odoo_partner_id,
          quoteNumber: lead.odoo_quote_number,
          orderNumber: lead.odoo_order_number,
          quoteAmount: lead.odoo_quote_amount,
          orderAmount: lead.odoo_order_amount,
          syncedAt: lead.odoo_synced_at,
          syncStatus: lead.odoo_sync_status,
        },
      },
      recentLogs: logs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get status',
      },
      { status: 500 }
    );
  }
}
