/**
 * Discount Advisor Kernel
 * AI-powered discount suggestions based on lead analysis
 * Analyzes lead score, order volume, urgency, competition, and conversion probability
 */

import * as claude from '../../services/ai/claude';
import * as db from '../../services/supabase';
import type {
  CloudCoreResult,
  Lead,
  Note,
} from '../../types';

export const KERNEL_CONFIG = {
  name: 'DiscountAdvisor',
  description: 'Provides AI-powered discount suggestions for price estimates',
  version: '1.0.0',
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  temperature: 0.5,
};

// ============================================
// Discount Advisor Types
// ============================================

export interface DiscountFactor {
  name: string;
  impact: 'increase' | 'decrease' | 'neutral';
  weight: number;
  description: string;
}

export interface DiscountSuggestion {
  suggestedPercentage: number;
  maxRecommended: number;
  minAcceptable: number;
  confidence: number;
  reasoning: string;
  factors: DiscountFactor[];
  urgencyLevel: 'high' | 'medium' | 'low';
  competitiveNote?: string;
}

export interface DiscountSuggestionRequest {
  leadId: string;
  subtotal: number;
  itemsCount: number;
  distanceKm?: number;
  productCategories?: string[];
  language?: 'en' | 'ta';
}

// ============================================
// Main Analysis Function
// ============================================

/**
 * Suggest optimal discount based on lead analysis
 */
export async function suggestDiscount(
  request: DiscountSuggestionRequest
): Promise<CloudCoreResult<DiscountSuggestion>> {
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
    const metrics = calculateMetrics(lead, notes, request);

    // Generate AI suggestion
    const suggestion = await generateAIDiscountSuggestion(
      lead,
      notes,
      metrics,
      request
    );

    return {
      success: true,
      data: suggestion,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Discount suggestion error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'DISCOUNT_SUGGESTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate discount suggestion',
      },
    };
  }
}

// ============================================
// Helper Functions
// ============================================

interface DiscountMetrics {
  leadScore: number;
  orderVolume: 'small' | 'medium' | 'large' | 'bulk';
  daysSinceCreated: number;
  notesCount: number;
  hasUrgencySignals: boolean;
  hasPriceSensitivity: boolean;
  conversionProbability: number;
  distanceKm: number;
  volumeMultiplier: number;
}

function calculateMetrics(
  lead: Lead,
  notes: Note[],
  request: DiscountSuggestionRequest
): DiscountMetrics {
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Determine order volume tier based on subtotal
  let orderVolume: 'small' | 'medium' | 'large' | 'bulk';
  let volumeMultiplier = 1;
  if (request.subtotal >= 200000) {
    orderVolume = 'bulk';
    volumeMultiplier = 1.5;
  } else if (request.subtotal >= 100000) {
    orderVolume = 'large';
    volumeMultiplier = 1.3;
  } else if (request.subtotal >= 50000) {
    orderVolume = 'medium';
    volumeMultiplier = 1.15;
  } else {
    orderVolume = 'small';
    volumeMultiplier = 1;
  }

  // Check notes for urgency signals
  const notesText = notes.map(n => n.text.toLowerCase()).join(' ');
  const urgencyKeywords = ['urgent', 'asap', 'immediately', 'fast', 'quickly', 'deadline', 'today', 'tomorrow'];
  const hasUrgencySignals = urgencyKeywords.some(keyword => notesText.includes(keyword));

  // Check for price sensitivity
  const priceKeywords = ['expensive', 'costly', 'budget', 'cheaper', 'discount', 'price', 'negotiate', 'competitor'];
  const hasPriceSensitivity = priceKeywords.some(keyword => notesText.includes(keyword));

  // Estimate conversion probability based on status
  const statusConversionMap: Record<string, number> = {
    hot: 0.85,
    follow_up: 0.6,
    new: 0.4,
    cold: 0.2,
    converted: 1.0,
    lost: 0.0,
  };
  const conversionProbability = lead.ai_score ?? statusConversionMap[lead.status] ?? 0.5;

  return {
    leadScore: lead.ai_score ?? 0.5,
    orderVolume,
    daysSinceCreated,
    notesCount: notes.length,
    hasUrgencySignals,
    hasPriceSensitivity,
    conversionProbability,
    distanceKm: request.distanceKm ?? 0,
    volumeMultiplier,
  };
}

async function generateAIDiscountSuggestion(
  lead: Lead,
  notes: Note[],
  metrics: DiscountMetrics,
  request: DiscountSuggestionRequest
): Promise<DiscountSuggestion> {
  const leadContext = formatLeadContext(lead);
  const notesContext = formatNotesContext(notes);
  const metricsContext = formatMetricsContext(metrics, request);

  const languageInstruction = request.language === 'ta'
    ? '\n\nIMPORTANT: Write the reasoning and competitiveNote in Tamil (தமிழ்).'
    : '';

  const result = await claude.completeJson<{
    suggestedPercentage: number;
    maxRecommended: number;
    minAcceptable: number;
    confidence: number;
    reasoning: string;
    factors: Array<{
      name: string;
      impact: 'increase' | 'decrease' | 'neutral';
      weight: number;
      description: string;
    }>;
    urgencyLevel: 'high' | 'medium' | 'low';
    competitiveNote?: string;
  }>({
    systemPrompt: `You are a pricing strategist for Maiyuri Bricks, a brick manufacturing business in Tamil Nadu, India.
Your role is to suggest optimal discounts that maximize conversion while maintaining profitability.

Business Rules:
- Maximum discount allowed: 15% (only for bulk orders and high-value leads)
- Typical discount range: 5-10%
- Minimum acceptable discount for negotiation: 2%
- Transport costs are NON-NEGOTIABLE
- Volume discounts: Larger orders can justify higher discounts
- Competition: If price sensitivity is detected, slightly higher discounts may be needed

Discount Factors to Consider:
1. Lead Score (higher = less discount needed)
2. Order Volume (larger = higher discount justified)
3. Urgency Signals (urgent = less discount needed)
4. Price Sensitivity (sensitive = may need higher discount)
5. Conversion Probability (high = less discount needed)
6. Distance (farther = keep discount lower to offset transport)
7. Lead Status (hot leads need less incentive)${languageInstruction}`,

    userPrompt: `Suggest an optimal discount for this price estimate:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

ORDER METRICS:
${metricsContext}

Respond with JSON:
{
  "suggestedPercentage": 8,
  "maxRecommended": 12,
  "minAcceptable": 5,
  "confidence": 0.85,
  "reasoning": "Brief explanation of recommendation",
  "factors": [
    {
      "name": "Lead Score",
      "impact": "decrease",
      "weight": 0.3,
      "description": "High score (0.82) indicates strong interest, less discount needed"
    }
  ],
  "urgencyLevel": "medium",
  "competitiveNote": "Optional note about competitive positioning"
}`,
    maxTokens: 1024,
    temperature: 0.4,
  });

  if (result.success && result.data) {
    return result.data;
  }

  // Fallback to rule-based suggestion
  return generateFallbackSuggestion(metrics);
}

function formatLeadContext(lead: Lead): string {
  return `Name: ${lead.name}
Contact: ${lead.contact}
Source: ${lead.source}
Type: ${lead.lead_type}
Status: ${lead.status}
Created: ${lead.created_at}
AI Score: ${lead.ai_score ?? 'Not scored'}
Current Summary: ${lead.ai_summary ?? 'No summary'}`;
}

function formatNotesContext(notes: Note[]): string {
  if (!notes.length) {
    return 'No interaction history available';
  }

  return notes
    .slice(0, 5)
    .map(
      (note, i) =>
        `[${i + 1}] ${note.date}: ${note.text}${
          note.transcription_text ? ` (Audio: ${note.transcription_text})` : ''
        }`
    )
    .join('\n\n');
}

function formatMetricsContext(
  metrics: DiscountMetrics,
  request: DiscountSuggestionRequest
): string {
  return `Subtotal: ₹${request.subtotal.toLocaleString('en-IN')}
Items Count: ${request.itemsCount}
Order Volume Tier: ${metrics.orderVolume.toUpperCase()}
Distance from Factory: ${metrics.distanceKm > 0 ? `${metrics.distanceKm} km` : 'Not specified'}
Days Since Lead Created: ${metrics.daysSinceCreated}
Number of Interactions: ${metrics.notesCount}
Lead Score: ${(metrics.leadScore * 100).toFixed(0)}%
Conversion Probability: ${(metrics.conversionProbability * 100).toFixed(0)}%
Urgency Signals Detected: ${metrics.hasUrgencySignals ? 'Yes' : 'No'}
Price Sensitivity Detected: ${metrics.hasPriceSensitivity ? 'Yes' : 'No'}
Volume Multiplier: ${metrics.volumeMultiplier}x`;
}

function generateFallbackSuggestion(metrics: DiscountMetrics): DiscountSuggestion {
  const factors: DiscountFactor[] = [];
  let baseDiscount = 5;

  // Factor 1: Lead Score
  if (metrics.leadScore >= 0.7) {
    factors.push({
      name: 'High Lead Score',
      impact: 'decrease',
      weight: 0.25,
      description: 'Strong interest detected, less discount incentive needed',
    });
    baseDiscount -= 1;
  } else if (metrics.leadScore < 0.4) {
    factors.push({
      name: 'Low Lead Score',
      impact: 'increase',
      weight: 0.2,
      description: 'May need additional incentive to convert',
    });
    baseDiscount += 2;
  }

  // Factor 2: Order Volume
  if (metrics.orderVolume === 'bulk') {
    factors.push({
      name: 'Bulk Order',
      impact: 'increase',
      weight: 0.3,
      description: 'Large order volume justifies volume discount',
    });
    baseDiscount += 4;
  } else if (metrics.orderVolume === 'large') {
    factors.push({
      name: 'Large Order',
      impact: 'increase',
      weight: 0.25,
      description: 'Significant order size supports moderate discount',
    });
    baseDiscount += 2;
  }

  // Factor 3: Price Sensitivity
  if (metrics.hasPriceSensitivity) {
    factors.push({
      name: 'Price Sensitivity',
      impact: 'increase',
      weight: 0.2,
      description: 'Customer has shown price concerns in discussions',
    });
    baseDiscount += 2;
  }

  // Factor 4: Urgency
  if (metrics.hasUrgencySignals) {
    factors.push({
      name: 'Urgency Detected',
      impact: 'decrease',
      weight: 0.15,
      description: 'Urgent timeline reduces need for price incentive',
    });
    baseDiscount -= 1;
  }

  // Clamp discount to valid range
  const suggestedPercentage = Math.min(15, Math.max(2, Math.round(baseDiscount)));
  const maxRecommended = Math.min(15, suggestedPercentage + 3);
  const minAcceptable = Math.max(0, suggestedPercentage - 3);

  // Determine urgency level
  let urgencyLevel: 'high' | 'medium' | 'low';
  if (metrics.conversionProbability >= 0.7 || metrics.hasUrgencySignals) {
    urgencyLevel = 'high';
  } else if (metrics.conversionProbability >= 0.4) {
    urgencyLevel = 'medium';
  } else {
    urgencyLevel = 'low';
  }

  return {
    suggestedPercentage,
    maxRecommended,
    minAcceptable,
    confidence: 0.6, // Lower confidence for rule-based
    reasoning: `Based on ${metrics.orderVolume} order volume and ${(metrics.conversionProbability * 100).toFixed(0)}% conversion probability. ${
      factors.length > 0 ? 'Key factors: ' + factors.map(f => f.name).join(', ') : ''
    }`,
    factors,
    urgencyLevel,
  };
}

/**
 * Quick discount suggestion - for real-time UI feedback
 */
export async function quickSuggest(
  leadId: string,
  subtotal: number,
  itemsCount: number
): Promise<CloudCoreResult<{ percentage: number; confidence: number }>> {
  const result = await suggestDiscount({
    leadId,
    subtotal,
    itemsCount,
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error,
    };
  }

  return {
    success: true,
    data: {
      percentage: result.data.suggestedPercentage,
      confidence: result.data.confidence,
    },
    meta: result.meta,
  };
}

export default {
  suggestDiscount,
  quickSuggest,
  KERNEL_CONFIG,
};
