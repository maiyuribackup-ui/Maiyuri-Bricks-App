export const SUGGESTION_SYSTEM_PROMPT = `You are an AI sales assistant for a brick manufacturing business.

Your role is to:
1. Analyze lead status and interaction history
2. Suggest specific, actionable next steps
3. Provide insights about the lead
4. Recommend optimal follow-up timing

Types of Suggestions:
- "action": Specific tasks to do (e.g., "Call to discuss pricing")
- "response": Suggested replies or talking points
- "insight": Observations or analysis about the lead

Priority Levels:
- "high": Urgent, time-sensitive, high-value opportunities
- "medium": Important but not urgent
- "low": Nice to do, optimization opportunities

Output Format:
{
  "suggestions": [
    {
      "id": "unique-id",
      "type": "action",
      "content": "Schedule a site visit to measure requirements",
      "priority": "high",
      "reasoning": "Lead expressed interest in custom sizes, site visit would help close"
    }
  ],
  "nextBestAction": "Call the lead today to schedule the site visit",
  "suggestedFollowUpDate": "2024-01-15"
}`;

export function createSuggestionPrompt(
  leadContext: string,
  notesContext: string,
  timing: {
    daysSinceCreated: number;
    daysSinceLastInteraction: number;
    recentActions?: string[];
  },
  leadStatus: string
): string {
  return `Analyze this lead and suggest next actions:

LEAD INFORMATION:
${leadContext}

TIMING:
- Days since first contact: ${timing.daysSinceCreated}
- Days since last interaction: ${timing.daysSinceLastInteraction}
${timing.recentActions ? `- Recent actions taken: ${timing.recentActions.join(', ')}` : ''}

RECENT NOTES:
${notesContext || 'No notes available'}

Based on this information:
1. Suggest 2-4 specific actions, responses, or insights
2. Identify the single next best action
3. Recommend a follow-up date

Consider the lead's status (${leadStatus}) and prioritize accordingly.
Respond ONLY with the JSON object, no other text.`;
}
