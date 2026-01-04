import {
  anthropic,
  DEFAULT_MODEL,
  successResult,
  errorResult,
  parseJsonResponse,
  formatNotesForContext,
  formatLeadForContext,
  daysSince,
} from '../utils';
import type { AgentResult, ScoringInput, ScoringOutput } from '../types';

const SYSTEM_PROMPT = `You are an AI assistant that scores sales leads for a brick manufacturing business.

Your role is to:
1. Analyze lead information and interaction history
2. Calculate a conversion probability score (0-1)
3. Identify positive and negative factors affecting the score
4. Provide actionable recommendations

Scoring Factors to Consider:
- Lead engagement level (frequency of interactions)
- Expressed urgency or timeline
- Budget indicators
- Decision-maker status
- Competition mentions
- Project specifics (size, type)
- Response timeliness
- Positive/negative sentiment in notes

Output Format:
Always respond with a JSON object:
{
  "score": 0.75,
  "confidence": 0.85,
  "factors": [
    {"factor": "High engagement - 5 interactions in 2 weeks", "impact": "positive", "weight": 0.2},
    {"factor": "No budget discussed", "impact": "negative", "weight": 0.1}
  ],
  "recommendation": "Schedule a site visit to close the deal"
}`;

/**
 * Scoring Agent
 * Calculates lead conversion probability
 */
export async function score(
  input: ScoringInput
): Promise<AgentResult<ScoringOutput>> {
  try {
    const { lead, notes, historicalData } = input;

    if (!lead) {
      return errorResult('Lead information is required for scoring');
    }

    // Calculate basic metrics
    const notesCount = notes.length;
    const daysSinceCreated = daysSince(lead.created_at);
    const daysSinceLastNote =
      notes.length > 0 ? daysSince(notes[0].created_at) : daysSinceCreated;
    const interactionFrequency =
      daysSinceCreated > 0 ? notesCount / daysSinceCreated : 0;

    // Format context
    const notesContext = formatNotesForContext(notes.slice(0, 10)); // Last 10 notes
    const leadContext = formatLeadForContext(lead);

    const userPrompt = `Please score this lead's conversion probability:

LEAD INFORMATION:
${leadContext}

METRICS:
- Days since created: ${daysSinceCreated}
- Total interactions: ${notesCount}
- Days since last interaction: ${daysSinceLastNote}
- Interaction frequency: ${interactionFrequency.toFixed(2)} per day
${historicalData ? `- Similar leads conversion rate: ${Math.round(historicalData.conversionRate * 100)}%` : ''}

RECENT NOTES:
${notesContext || 'No notes available'}

Analyze all factors and provide a conversion probability score (0-1).
Respond ONLY with the JSON object, no other text.`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract text from response
    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON response
    const parsed = parseJsonResponse<ScoringOutput>(responseText);

    if (!parsed) {
      // If parsing fails, return a basic score based on metrics
      const basicScore = calculateBasicScore(lead, notes);
      return successResult(basicScore, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });
    }

    // Ensure score is within bounds
    parsed.score = Math.max(0, Math.min(1, parsed.score));
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    return successResult(parsed, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Scoring error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Scoring failed'
    );
  }
}

/**
 * Calculate a basic score without AI (fallback)
 */
function calculateBasicScore(
  lead: ScoringInput['lead'],
  notes: ScoringInput['notes']
): ScoringOutput {
  const factors: ScoringOutput['factors'] = [];
  let baseScore = 0.5;

  // Status factor
  const statusScores: Record<string, number> = {
    hot: 0.8,
    follow_up: 0.6,
    new: 0.5,
    cold: 0.3,
    converted: 1.0,
    lost: 0.0,
  };
  const statusScore = statusScores[lead.status] || 0.5;
  factors.push({
    factor: `Lead status: ${lead.status}`,
    impact: statusScore > 0.5 ? 'positive' : statusScore < 0.5 ? 'negative' : 'neutral',
    weight: 0.3,
  });
  baseScore = baseScore * 0.7 + statusScore * 0.3;

  // Engagement factor
  if (notes.length >= 5) {
    factors.push({
      factor: 'High engagement (5+ interactions)',
      impact: 'positive',
      weight: 0.2,
    });
    baseScore += 0.1;
  } else if (notes.length === 0) {
    factors.push({
      factor: 'No interactions recorded',
      impact: 'negative',
      weight: 0.15,
    });
    baseScore -= 0.1;
  }

  // Follow-up date factor
  if (lead.follow_up_date) {
    const daysUntilFollowUp = -daysSince(lead.follow_up_date);
    if (daysUntilFollowUp < 0) {
      factors.push({
        factor: 'Overdue follow-up',
        impact: 'negative',
        weight: 0.1,
      });
      baseScore -= 0.05;
    } else if (daysUntilFollowUp <= 3) {
      factors.push({
        factor: 'Follow-up scheduled soon',
        impact: 'positive',
        weight: 0.1,
      });
      baseScore += 0.05;
    }
  }

  return {
    score: Math.max(0, Math.min(1, baseScore)),
    confidence: 0.6, // Lower confidence for basic scoring
    factors,
    recommendation: generateBasicRecommendation(lead, notes),
  };
}

/**
 * Generate basic recommendation without AI
 */
function generateBasicRecommendation(
  lead: ScoringInput['lead'],
  notes: ScoringInput['notes']
): string {
  if (lead.status === 'hot') {
    return 'High priority - schedule a closing meeting';
  }
  if (lead.status === 'new' && notes.length === 0) {
    return 'Make initial contact to qualify the lead';
  }
  if (lead.status === 'cold') {
    return 'Consider re-engagement with special offer';
  }
  if (lead.follow_up_date) {
    const daysUntilFollowUp = -daysSince(lead.follow_up_date);
    if (daysUntilFollowUp < 0) {
      return 'Follow up immediately - overdue by ' + Math.abs(daysUntilFollowUp) + ' days';
    }
  }
  return 'Continue nurturing with regular follow-ups';
}

export default {
  score,
};
