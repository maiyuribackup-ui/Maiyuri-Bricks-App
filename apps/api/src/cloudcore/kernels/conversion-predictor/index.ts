/**
 * Conversion Predictor Kernel
 * Predicts lead conversion probability with detailed factor analysis
 * Uses Claude for prediction reasoning
 */

import * as claude from '../../services/ai/claude';
import * as db from '../../services/supabase';
import type {
  CloudCoreResult,
  ConversionPredictionRequest,
  ConversionPrediction,
  PredictionFactor,
  HistoricalComparison,
  Lead,
  Note,
} from '../../types';

export const KERNEL_CONFIG = {
  name: 'ConversionPredictor',
  description: 'Predicts lead conversion probability with detailed analysis',
  version: '1.0.0',
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
  temperature: 0.3, // Lower temperature for more consistent predictions
};

/**
 * Predict conversion probability for a lead
 */
export async function predict(
  request: ConversionPredictionRequest
): Promise<CloudCoreResult<ConversionPrediction>> {
  const startTime = Date.now();

  try {
    // Fetch lead and notes
    const [leadResult, notesResult] = await Promise.all([
      db.getLead(request.leadId),
      db.getNotes(request.leadId),
    ]);

    if (!leadResult.success || !leadResult.data) {
      return {
        success: false,
        data: null,
        error: {
          code: 'LEAD_NOT_FOUND',
          message: `Lead not found: ${request.leadId}`,
        },
      };
    }

    const lead = leadResult.data;
    const notes = notesResult.data || [];

    // Calculate metrics
    const metrics = calculateMetrics(lead, notes);

    // Get historical comparison if requested
    let historicalComparison: HistoricalComparison | undefined;
    if (request.options?.includeHistoricalComparison) {
      historicalComparison = await getHistoricalComparison(lead);
    }

    // Generate prediction
    const prediction = await generatePrediction(
      lead,
      notes,
      metrics,
      historicalComparison,
      request.options
    );

    // Update lead with new score
    await db.updateLeadAI(request.leadId, {
      ai_score: prediction.probability,
    });

    return {
      success: true,
      data: prediction,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Prediction error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'PREDICTION_ERROR',
        message: error instanceof Error ? error.message : 'Prediction failed',
      },
    };
  }
}

/**
 * Calculate lead metrics
 */
function calculateMetrics(lead: Lead, notes: Note[]) {
  const now = Date.now();
  const createdAt = new Date(lead.created_at).getTime();
  const daysSinceCreated = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

  const lastNote = notes[0];
  const daysSinceLastNote = lastNote
    ? Math.floor((now - new Date(lastNote.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : daysSinceCreated;

  const notesPerDay = daysSinceCreated > 0 ? notes.length / daysSinceCreated : 0;

  // Calculate note frequency trend
  const recentNotes = notes.slice(0, 5);
  const olderNotes = notes.slice(5, 10);
  let frequencyTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (recentNotes.length > olderNotes.length) {
    frequencyTrend = 'increasing';
  } else if (recentNotes.length < olderNotes.length) {
    frequencyTrend = 'decreasing';
  }

  // Calculate average note length (engagement depth)
  const avgNoteLength = notes.length > 0
    ? notes.reduce((sum, n) => sum + n.text.length, 0) / notes.length
    : 0;

  // Check for audio notes (higher engagement)
  const audioNoteCount = notes.filter((n) => n.audio_url).length;
  const audioNoteRatio = notes.length > 0 ? audioNoteCount / notes.length : 0;

  return {
    daysSinceCreated,
    daysSinceLastNote,
    totalNotes: notes.length,
    notesPerDay,
    frequencyTrend,
    avgNoteLength,
    audioNoteCount,
    audioNoteRatio,
  };
}

/**
 * Get historical comparison data
 */
async function getHistoricalComparison(lead: Lead): Promise<HistoricalComparison | undefined> {
  try {
    const [similarLeadsResult, conversionRateResult] = await Promise.all([
      db.getSimilarLeads(lead.lead_type, lead.source, 50),
      db.getConversionRate(lead.lead_type),
    ]);

    if (!similarLeadsResult.success || !similarLeadsResult.data) {
      return undefined;
    }

    const similarLeads = similarLeadsResult.data;
    const convertedLeads = similarLeads.filter((l) => l.status === 'converted');

    // Calculate average time to conversion
    const conversionTimes = convertedLeads
      .map((l) => {
        const created = new Date(l.created_at).getTime();
        const updated = new Date(l.updated_at).getTime();
        return (updated - created) / (1000 * 60 * 60 * 24);
      })
      .filter((t) => t > 0);

    const avgTimeToConversion = conversionTimes.length > 0
      ? conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length
      : 30; // Default 30 days

    // Identify top success factors (simplified)
    const topSuccessFactors: string[] = [];
    if (convertedLeads.length > 0) {
      // Check common sources
      const sourceCount: Record<string, number> = {};
      convertedLeads.forEach((l) => {
        sourceCount[l.source] = (sourceCount[l.source] || 0) + 1;
      });
      const topSource = Object.entries(sourceCount).sort((a, b) => b[1] - a[1])[0];
      if (topSource && topSource[1] > convertedLeads.length * 0.3) {
        topSuccessFactors.push(`Strong source: ${topSource[0]}`);
      }
    }

    return {
      similarLeadsCount: similarLeads.length,
      averageConversionRate: conversionRateResult.data || 0,
      averageTimeToConversion: Math.round(avgTimeToConversion),
      topSuccessFactors,
    };
  } catch (error) {
    console.error('Error getting historical comparison:', error);
    return undefined;
  }
}

/**
 * Generate prediction using Claude
 */
async function generatePrediction(
  lead: Lead,
  notes: Note[],
  metrics: ReturnType<typeof calculateMetrics>,
  historicalComparison: HistoricalComparison | undefined,
  options?: ConversionPredictionRequest['options']
): Promise<ConversionPrediction> {
  const leadContext = `Name: ${lead.name}
Contact: ${lead.contact}
Source: ${lead.source}
Type: ${lead.lead_type}
Status: ${lead.status}
Created: ${lead.created_at}`;

  const metricsContext = `Days since created: ${metrics.daysSinceCreated}
Days since last interaction: ${metrics.daysSinceLastNote}
Total interactions: ${metrics.totalNotes}
Interactions per day: ${metrics.notesPerDay.toFixed(2)}
Engagement trend: ${metrics.frequencyTrend}
Average note length: ${Math.round(metrics.avgNoteLength)} chars
Audio notes: ${metrics.audioNoteCount} (${Math.round(metrics.audioNoteRatio * 100)}%)`;

  const notesContext = notes.slice(0, 5)
    .map((n, i) => `[${i + 1}] ${n.date}: ${n.text.substring(0, 200)}...`)
    .join('\n');

  let historicalContext = '';
  if (historicalComparison) {
    historicalContext = `
HISTORICAL DATA:
Similar leads analyzed: ${historicalComparison.similarLeadsCount}
Historical conversion rate: ${Math.round(historicalComparison.averageConversionRate * 100)}%
Average days to conversion: ${historicalComparison.averageTimeToConversion}
${historicalComparison.topSuccessFactors.length > 0 ? `Success factors: ${historicalComparison.topSuccessFactors.join(', ')}` : ''}`;
  }

  const result = await claude.completeJson<{
    probability: number;
    confidence: number;
    predictedDays?: number;
    factors: Array<{
      name: string;
      value: number;
      impact: string;
      weight: number;
    }>;
  }>({
    systemPrompt: `You are a lead conversion prediction expert for a brick manufacturing business.
Analyze lead data and predict conversion probability with detailed factor analysis.

Prediction Guidelines:
- Base predictions on engagement patterns and industry knowledge
- Consider brick/construction industry sales cycles
- Factor in regional (Tamil Nadu, India) business practices
- Weight recent interactions more heavily
- Consider lead source quality`,
    userPrompt: `Predict conversion probability for this lead:

LEAD INFORMATION:
${leadContext}

ENGAGEMENT METRICS:
${metricsContext}

RECENT INTERACTIONS:
${notesContext || 'No notes available'}
${historicalContext}

Analyze and respond with JSON:
{
  "probability": 0.75,
  "confidence": 0.85,
  "predictedDays": 14,
  "factors": [
    {"name": "Factor description", "value": 0.8, "impact": "positive|negative|neutral", "weight": 0.2}
  ]
}`,
    maxTokens: 1024,
    temperature: 0.3,
  });

  if (result.success && result.data) {
    const factors: PredictionFactor[] = result.data.factors.map((f) => ({
      name: f.name,
      value: f.value,
      impact: f.impact as 'positive' | 'negative' | 'neutral',
      weight: f.weight,
    }));

    // Calculate predicted date if days provided
    let predictedDate: string | undefined;
    if (result.data.predictedDays) {
      const date = new Date();
      date.setDate(date.getDate() + result.data.predictedDays);
      predictedDate = date.toISOString().split('T')[0];
    }

    return {
      probability: Math.max(0, Math.min(1, result.data.probability)),
      confidence: Math.max(0, Math.min(1, result.data.confidence)),
      predictedDate,
      factors,
      historicalComparison,
    };
  }

  // Fallback to rule-based prediction
  return generateRuleBasedPrediction(lead, metrics, historicalComparison);
}

/**
 * Generate rule-based prediction as fallback
 */
function generateRuleBasedPrediction(
  lead: Lead,
  metrics: ReturnType<typeof calculateMetrics>,
  historicalComparison: HistoricalComparison | undefined
): ConversionPrediction {
  const factors: PredictionFactor[] = [];
  let baseProbability = 0.5;

  // Status factor
  const statusScores: Record<string, number> = {
    hot: 0.8,
    follow_up: 0.6,
    new: 0.5,
    cold: 0.3,
  };
  const statusScore = statusScores[lead.status] || 0.5;
  factors.push({
    name: `Lead status: ${lead.status}`,
    value: statusScore,
    impact: statusScore > 0.5 ? 'positive' : statusScore < 0.5 ? 'negative' : 'neutral',
    weight: 0.25,
  });
  baseProbability = baseProbability * 0.75 + statusScore * 0.25;

  // Engagement factor
  if (metrics.totalNotes >= 5) {
    factors.push({
      name: 'High engagement (5+ interactions)',
      value: 0.8,
      impact: 'positive',
      weight: 0.2,
    });
    baseProbability += 0.1;
  } else if (metrics.totalNotes === 0) {
    factors.push({
      name: 'No interactions recorded',
      value: 0.2,
      impact: 'negative',
      weight: 0.15,
    });
    baseProbability -= 0.1;
  }

  // Recency factor
  if (metrics.daysSinceLastNote <= 3) {
    factors.push({
      name: 'Recent interaction (within 3 days)',
      value: 0.8,
      impact: 'positive',
      weight: 0.15,
    });
    baseProbability += 0.05;
  } else if (metrics.daysSinceLastNote > 14) {
    factors.push({
      name: 'Stale lead (no interaction in 14+ days)',
      value: 0.3,
      impact: 'negative',
      weight: 0.15,
    });
    baseProbability -= 0.1;
  }

  // Trend factor
  if (metrics.frequencyTrend === 'increasing') {
    factors.push({
      name: 'Increasing engagement trend',
      value: 0.75,
      impact: 'positive',
      weight: 0.1,
    });
    baseProbability += 0.05;
  } else if (metrics.frequencyTrend === 'decreasing') {
    factors.push({
      name: 'Decreasing engagement trend',
      value: 0.35,
      impact: 'negative',
      weight: 0.1,
    });
    baseProbability -= 0.05;
  }

  // Historical comparison adjustment
  if (historicalComparison) {
    if (baseProbability > historicalComparison.averageConversionRate * 1.5) {
      // Above average performer
      factors.push({
        name: 'Above historical average performance',
        value: 0.8,
        impact: 'positive',
        weight: 0.1,
      });
    } else if (baseProbability < historicalComparison.averageConversionRate * 0.5) {
      // Below average performer
      factors.push({
        name: 'Below historical average performance',
        value: 0.3,
        impact: 'negative',
        weight: 0.1,
      });
    }
  }

  return {
    probability: Math.max(0, Math.min(1, baseProbability)),
    confidence: 0.6, // Lower confidence for rule-based
    factors,
    historicalComparison,
  };
}

/**
 * Batch predict for multiple leads
 */
export async function batchPredict(
  leadIds: string[]
): Promise<CloudCoreResult<Map<string, ConversionPrediction>>> {
  const startTime = Date.now();
  const results = new Map<string, ConversionPrediction>();

  try {
    // Process in parallel with concurrency limit
    const batchSize = 5;
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      const predictions = await Promise.all(
        batch.map((id) =>
          predict({ leadId: id, options: { includeFactorAnalysis: true } })
        )
      );

      predictions.forEach((result, index) => {
        if (result.success && result.data) {
          results.set(batch[index], result.data);
        }
      });
    }

    return {
      success: true,
      data: results,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Batch prediction error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'BATCH_PREDICTION_ERROR',
        message: error instanceof Error ? error.message : 'Batch prediction failed',
      },
    };
  }
}

export default {
  predict,
  batchPredict,
  KERNEL_CONFIG,
};
