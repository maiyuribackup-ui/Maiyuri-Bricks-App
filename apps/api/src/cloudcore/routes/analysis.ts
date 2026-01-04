/**
 * Lead Analysis Route Handlers
 */

import * as leadAnalyst from '../kernels/lead-analyst';
import * as conversionPredictor from '../kernels/conversion-predictor';
import * as contracts from '../contracts';
import type { CloudCoreResult, LeadAnalysisResponse, ConversionPrediction } from '../types';

/**
 * Analyze a lead
 */
export async function analyzeLead(
  data: contracts.LeadAnalysisRequest
): Promise<CloudCoreResult<LeadAnalysisResponse>> {
  // Validate request
  const parsed = contracts.LeadAnalysisRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  return leadAnalyst.analyze({
    leadId: parsed.data.leadId,
    analysisType: parsed.data.analysisType,
    options: parsed.data.options,
  });
}

/**
 * Quick analyze a lead (lightweight)
 */
export async function quickAnalyze(
  leadId: string
): Promise<CloudCoreResult<{ summary: string; score: number; nextAction: string }>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(leadId);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid lead ID format',
      },
    };
  }

  return leadAnalyst.quickAnalyze(leadId);
}

/**
 * Predict lead conversion
 */
export async function predictConversion(
  data: contracts.ConversionPredictionRequest
): Promise<CloudCoreResult<ConversionPrediction>> {
  // Validate request
  const parsed = contracts.ConversionPredictionRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  return conversionPredictor.predict({
    leadId: parsed.data.leadId,
    options: parsed.data.options,
  });
}

/**
 * Batch predict conversions for multiple leads
 */
export async function batchPredictConversions(
  leadIds: string[]
): Promise<CloudCoreResult<Map<string, ConversionPrediction>>> {
  // Validate IDs
  for (const id of leadIds) {
    const parsed = contracts.UUIDSchema.safeParse(id);
    if (!parsed.success) {
      return {
        success: false,
        data: null,
        error: {
          code: 'INVALID_ID',
          message: `Invalid lead ID format: ${id}`,
        },
      };
    }
  }

  return conversionPredictor.batchPredict(leadIds);
}

export default {
  analyzeLead,
  quickAnalyze,
  predictConversion,
  batchPredictConversions,
};
