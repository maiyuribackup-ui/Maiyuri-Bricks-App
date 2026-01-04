import { supabaseAdmin } from '@/lib/supabase';
import { success, error } from '@/lib/api-utils';

interface DashboardStats {
  totalLeads: number;
  hotLeads: number;
  dueToday: number;
  converted: number;
  newLeads: number;
  followUp: number;
  cold: number;
  lost: number;
}

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get all stats in parallel
    const [
      totalResult,
      hotResult,
      dueTodayResult,
      convertedResult,
      newResult,
      followUpResult,
      coldResult,
      lostResult,
    ] = await Promise.all([
      // Total leads (excluding lost)
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true }),

      // Hot leads
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'hot'),

      // Due today (follow_up_date is today)
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('follow_up_date', todayStr)
        .in('status', ['new', 'follow_up', 'hot']),

      // Converted
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'converted'),

      // New
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new'),

      // Follow up
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'follow_up'),

      // Cold
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'cold'),

      // Lost
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'lost'),
    ]);

    const stats: DashboardStats = {
      totalLeads: totalResult.count || 0,
      hotLeads: hotResult.count || 0,
      dueToday: dueTodayResult.count || 0,
      converted: convertedResult.count || 0,
      newLeads: newResult.count || 0,
      followUp: followUpResult.count || 0,
      cold: coldResult.count || 0,
      lost: lostResult.count || 0,
    };

    return success(stats);
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    return error('Internal server error', 500);
  }
}
