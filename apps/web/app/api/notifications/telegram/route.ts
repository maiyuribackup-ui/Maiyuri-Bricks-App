import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase-server';
import {
  testTelegramConnection,
  sendTelegramMessage,
  notifyNewLead,
  notifyNewLeadDetailed,
  notifyStaffInvited,
  notifyDailySummary,
  notifyAIAnalysis,
  type AIAnalysisNotification,
  type NewLeadNotification,
} from '@/lib/telegram';

/**
 * POST /api/notifications/telegram
 * Send Telegram notifications or test connection
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, payload } = body;

    if (!type) {
      return NextResponse.json(
        { error: 'Notification type is required' },
        { status: 400 }
      );
    }

    let result;

    switch (type) {
      case 'test':
        // Test the Telegram connection
        result = await testTelegramConnection();
        break;

      case 'custom':
        // Send a custom message
        if (!payload?.message) {
          return NextResponse.json(
            { error: 'Message is required for custom notifications' },
            { status: 400 }
          );
        }
        result = await sendTelegramMessage(payload.message);
        break;

      case 'new_lead':
        // Notify about new lead
        if (!payload?.leadName || !payload?.phone) {
          return NextResponse.json(
            { error: 'leadName and phone are required' },
            { status: 400 }
          );
        }
        result = await notifyNewLead(
          payload.leadName,
          payload.phone,
          payload.source
        );
        break;

      case 'staff_invited':
        // Notify about staff invitation
        if (!payload?.staffName || !payload?.email || !payload?.role) {
          return NextResponse.json(
            { error: 'staffName, email, and role are required' },
            { status: 400 }
          );
        }
        result = await notifyStaffInvited(
          payload.staffName,
          payload.email,
          payload.role
        );
        break;

      case 'daily_summary':
        // Send daily summary
        if (!payload?.stats) {
          return NextResponse.json(
            { error: 'stats object is required' },
            { status: 400 }
          );
        }
        result = await notifyDailySummary(payload.stats);
        break;

      case 'new_lead_detailed':
        // Notify about new lead with full details
        if (!payload?.lead) {
          return NextResponse.json(
            { error: 'lead object is required' },
            { status: 400 }
          );
        }
        result = await notifyNewLeadDetailed(payload.lead as NewLeadNotification);
        break;

      case 'ai_analysis':
        // Notify about AI analysis results
        if (!payload?.analysis) {
          return NextResponse.json(
            { error: 'analysis object is required' },
            { status: 400 }
          );
        }
        result = await notifyAIAnalysis(payload.analysis as AIAnalysisNotification);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown notification type: ${type}` },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
    });
  } catch (error) {
    console.error('Telegram notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/telegram
 * Check Telegram configuration status
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const configured = !!(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    );

    return NextResponse.json({
      configured,
      message: configured
        ? 'Telegram is configured'
        : 'Telegram credentials not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
    });
  } catch (error) {
    console.error('Telegram status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check Telegram status' },
      { status: 500 }
    );
  }
}
