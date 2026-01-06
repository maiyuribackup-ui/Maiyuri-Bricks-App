import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/kpi/business - Get business KPI scores
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = contracts.BusinessKPIRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.kpi.getBusinessKPI(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get business KPIs', 500);
    }

    return success(result.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Business KPI error:', err);
    return error('Failed to get business KPIs', 500);
  }
}

// GET /api/kpi/business - Get business KPIs with defaults
export async function GET() {
  try {
    const result = await routes.kpi.getBusinessKPI({
      timeRange: 'month',
      compareToPrevious: true,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to get business KPIs', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Business KPI error:', err);
    return error('Failed to get business KPIs', 500);
  }
}
