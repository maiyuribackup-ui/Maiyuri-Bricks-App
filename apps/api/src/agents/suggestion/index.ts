import {
  anthropic,
  DEFAULT_MODEL,
  successResult,
  errorResult,
  parseJsonResponse,
  formatNotesForContext,
  formatLeadForContext,
  generateId,
  daysSince,
} from '../utils';
import type { AgentResult, SuggestionInput, SuggestionOutput } from '../types';

const SYSTEM_PROMPT = `You are an AI sales assistant for a brick manufacturing business.

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

/**
 * Suggestion Agent
 * Provides actionable recommendations for leads
 */
export async function suggest(
  input: SuggestionInput
): Promise<AgentResult<SuggestionOutput>> {
  try {
    const { lead, notes, context } = input;

    if (!lead) {
      return errorResult('Lead information is required for suggestions');
    }

    // Format context
    const notesContext = formatNotesForContext(notes.slice(0, 5)); // Recent 5 notes
    const leadContext = formatLeadForContext(lead);

    // Calculate time-related factors
    const daysSinceCreated = daysSince(lead.created_at);
    const daysSinceLastInteraction =
      notes.length > 0 ? daysSince(notes[0].created_at) : daysSinceCreated;

    const userPrompt = `Analyze this lead and suggest next actions:

LEAD INFORMATION:
${leadContext}

TIMING:
- Days since first contact: ${daysSinceCreated}
- Days since last interaction: ${daysSinceLastInteraction}
${context?.recentActions ? `- Recent actions taken: ${context.recentActions.join(', ')}` : ''}

RECENT NOTES:
${notesContext || 'No notes available'}

Based on this information:
1. Suggest 2-4 specific actions, responses, or insights
2. Identify the single next best action
3. Recommend a follow-up date

Consider the lead's status (${lead.status}) and prioritize accordingly.
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
    const parsed = parseJsonResponse<SuggestionOutput>(responseText);

    if (!parsed) {
      // If parsing fails, generate basic suggestions
      return successResult(generateBasicSuggestions(lead, notes), {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });
    }

    // Ensure all suggestions have IDs
    parsed.suggestions = parsed.suggestions.map((s) => ({
      ...s,
      id: s.id || generateId(),
    }));

    return successResult(parsed, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Suggestion error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Suggestion generation failed'
    );
  }
}

/**
 * Generate basic suggestions without AI (fallback)
 */
function generateBasicSuggestions(
  lead: SuggestionInput['lead'],
  notes: SuggestionInput['notes']
): SuggestionOutput {
  const suggestions: SuggestionOutput['suggestions'] = [];
  const today = new Date();
  const followUpDate = new Date(today);
  followUpDate.setDate(followUpDate.getDate() + 3);

  // Status-based suggestions
  switch (lead.status) {
    case 'new':
      suggestions.push({
        id: generateId(),
        type: 'action',
        content: 'Make initial contact to understand requirements',
        priority: 'high',
        reasoning: 'New lead needs qualification',
      });
      break;

    case 'hot':
      suggestions.push({
        id: generateId(),
        type: 'action',
        content: 'Send quotation or schedule closing meeting',
        priority: 'high',
        reasoning: 'Hot lead ready for conversion',
      });
      followUpDate.setDate(today.getDate() + 1); // Follow up sooner
      break;

    case 'follow_up':
      suggestions.push({
        id: generateId(),
        type: 'action',
        content: 'Follow up on previous discussion',
        priority: 'medium',
        reasoning: 'Lead needs continued nurturing',
      });
      break;

    case 'cold':
      suggestions.push({
        id: generateId(),
        type: 'action',
        content: 'Consider re-engagement with special offer or new product info',
        priority: 'low',
        reasoning: 'Cold lead may need incentive to re-engage',
      });
      followUpDate.setDate(today.getDate() + 7); // Follow up later
      break;
  }

  // Engagement-based suggestions
  if (notes.length === 0) {
    suggestions.push({
      id: generateId(),
      type: 'insight',
      content: 'No interaction history - recommend initial contact',
      priority: 'high',
      reasoning: 'Lead has no recorded interactions',
    });
  } else if (notes.length > 5) {
    suggestions.push({
      id: generateId(),
      type: 'insight',
      content: 'Multiple interactions recorded - lead is engaged',
      priority: 'medium',
      reasoning: 'High engagement indicates potential interest',
    });
  }

  // Follow-up date suggestion
  if (lead.follow_up_date) {
    const daysUntil = -daysSince(lead.follow_up_date);
    if (daysUntil < 0) {
      suggestions.push({
        id: generateId(),
        type: 'action',
        content: `Overdue follow-up by ${Math.abs(daysUntil)} days - contact immediately`,
        priority: 'high',
        reasoning: 'Follow-up date has passed',
      });
    }
  }

  return {
    suggestions,
    nextBestAction: suggestions[0]?.content || 'Review lead details and make contact',
    suggestedFollowUpDate: followUpDate.toISOString().split('T')[0],
  };
}

export default {
  suggest,
};
