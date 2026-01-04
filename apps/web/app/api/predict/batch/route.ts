import { NextRequest } from 'next/server';
import { routes } from '@maiyuri/api';
import { success, error } from '@/lib/api-utils';

// POST /api/predict/batch - Batch predict conversion for multiple leads
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return error('leadIds array is required', 400);
    }

    if (leadIds.length > 50) {
      return error('Maximum 50 leads per batch', 400);
    }

    const result = await routes.analysis.batchPredictConversions(leadIds);

    if (!result.success) {
      return error(result.error?.message || 'Batch prediction failed', 500);
    }

    // Convert Map to object for JSON serialization
    const predictions: Record<string, unknown> = {};
    if (result.data) {
      result.data.forEach((value, key) => {
        predictions[key] = value;
      });
    }

    return success({ predictions });
  } catch (err) {
    console.error('Batch prediction error:', err);
    return error('Failed to batch predict conversions', 500);
  }
}
