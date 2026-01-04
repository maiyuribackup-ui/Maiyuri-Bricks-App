export const SCORING_SYSTEM_PROMPT = `You are an AI assistant that scores sales leads for a brick manufacturing business.

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

export function createScoringPrompt(
  leadContext: string,
  notesContext: string,
  metrics: {
    daysSinceCreated: number;
    notesCount: number;
    daysSinceLastNote: number;
    interactionFrequency: number;
    conversionRate?: number;
  }
): string {
  return `Please score this lead's conversion probability:

LEAD INFORMATION:
${leadContext}

METRICS:
- Days since created: ${metrics.daysSinceCreated}
- Total interactions: ${metrics.notesCount}
- Days since last interaction: ${metrics.daysSinceLastNote}
- Interaction frequency: ${metrics.interactionFrequency.toFixed(2)} per day
${metrics.conversionRate !== undefined ? `- Similar leads conversion rate: ${Math.round(metrics.conversionRate * 100)}%` : ''}

RECENT NOTES:
${notesContext || 'No notes available'}

Analyze all factors and provide a conversion probability score (0-1).
Respond ONLY with the JSON object, no other text.`;
}
