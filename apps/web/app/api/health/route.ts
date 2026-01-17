export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { routes } from '@maiyuri/api';
import { success, error } from '@/lib/api-utils';

// GET /api/health - Comprehensive health check using CloudCore
export async function GET(request: NextRequest) {
  try {
    // Use CloudCore's health route for comprehensive check
    const result = await routes.health.getHealth();

    if (!result.success || !result.data) {
      return error('Health check failed', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Health check error:', err);
    return error('Health check failed', 500);
  }
}

// GET /api/health/ping - Simple ping check
export async function HEAD(request: NextRequest) {
  try {
    const result = await routes.health.ping();

    if (!result.success) {
      return new Response(null, { status: 503 });
    }

    return new Response(null, { status: 200 });
  } catch (err) {
    return new Response(null, { status: 503 });
  }
}
