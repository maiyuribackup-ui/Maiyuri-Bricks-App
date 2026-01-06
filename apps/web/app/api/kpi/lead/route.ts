import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/kpi/lead - Get lead KPI scores
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = contracts.LeadKPIRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.kpi.getLeadKPI(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get lead KPIs', 500);
    }

    return success(result.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Lead KPI error:', err);
    return error('Failed to get lead KPIs', 500);
  }
}

// GET /api/kpi/lead - Get all lead KPIs
export async function GET() {
  try {
    const result = await routes.kpi.getLeadKPI({ timeRange: 'month' });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get lead KPIs', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Lead KPI error:', err);
    return error('Failed to get lead KPIs', 500);
  }
}
