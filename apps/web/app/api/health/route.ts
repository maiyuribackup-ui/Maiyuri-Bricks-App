import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error } from '@/lib/api-utils';

// GET /api/health - Health check endpoint
export async function GET(request: NextRequest) {
  try {
    // Check database connection
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1);

    const dbStatus = dbError ? 'error' : 'healthy';

    return success({
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        api: 'healthy',
      },
    });
  } catch (err) {
    console.error('Health check error:', err);
    return error('Health check failed', 500);
  }
}
