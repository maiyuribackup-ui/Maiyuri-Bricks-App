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

    // Get all stats in parallel (excluding archived leads)
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
      // Total leads (excluding archived)
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false),

      // Hot leads
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'hot')
        .eq('is_archived', false),

      // Due today (follow_up_date is today)
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('follow_up_date', todayStr)
        .in('status', ['new', 'follow_up', 'hot'])
        .eq('is_archived', false),

      // Converted
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'converted')
        .eq('is_archived', false),

      // New
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
        .eq('is_archived', false),

      // Follow up
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'follow_up')
        .eq('is_archived', false),

      // Cold
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'cold')
        .eq('is_archived', false),

      // Lost
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'lost')
        .eq('is_archived', false),
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
