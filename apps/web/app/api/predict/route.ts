import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

// POST /api/predict - Predict conversion probability for a lead
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.ConversionPredictionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.analysis.predictConversion(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Failed to predict conversion', 500);
    }

    return success(result.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Conversion prediction error:', err);
    return error('Failed to predict conversion', 500);
  }
}
