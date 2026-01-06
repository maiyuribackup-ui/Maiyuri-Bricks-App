import { routes } from '@maiyuri/api';
import { success, error } from '@/lib/api-utils';

// GET /api/kpi/dashboard - Get complete KPI dashboard
export async function GET() {
  try {
    const result = await routes.kpi.getDashboard();

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get KPI dashboard', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('KPI dashboard error:', err);
    return error('Failed to get KPI dashboard', 500);
  }
}
