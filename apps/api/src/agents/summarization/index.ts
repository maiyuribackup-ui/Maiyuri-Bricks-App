import {
  anthropic,
  DEFAULT_MODEL,
  successResult,
  errorResult,
  parseJsonResponse,
  formatNotesForContext,
  formatLeadForContext,
} from '../utils';
import type {
  AgentResult,
  SummarizationInput,
  SummarizationOutput,
} from '../types';

const SYSTEM_PROMPT = `You are an AI assistant specializing in summarizing sales lead interactions for a brick manufacturing business.

Your role is to:
1. Analyze notes and conversations about leads
2. Extract key information and action items
3. Identify important dates and commitments
4. Provide concise, actionable summaries

Context:
- This is for Maiyuri Bricks, a brick manufacturing company
- Leads can be from various sources (phone, walk-in, referral)
- Notes may be in English, Tamil, or mixed
- Focus on business-relevant information

Output Format:
Always respond with a JSON object containing:
{
  "summary": "A 2-3 sentence executive summary of all interactions",
  "highlights": ["Key point 1", "Key point 2", "Key point 3"],
  "actionItems": ["Action 1", "Action 2"],
  "keyDates": ["Date 1 - Event description", "Date 2 - Event description"]
}`;

/**
 * Summarization Agent
 * Generates summaries from notes and lead interactions
 */
export async function summarize(
  input: SummarizationInput
): Promise<AgentResult<SummarizationOutput>> {
  try {
    const { notes, lead, maxLength = 500 } = input;

    if (!notes || notes.length === 0) {
      return errorResult('No notes provided for summarization');
    }

    // Format context
    const notesContext = formatNotesForContext(notes);
    const leadContext = lead ? formatLeadForContext(lead) : '';

    const userPrompt = `Please summarize the following ${notes.length} note(s) for this lead:

${leadContext ? `LEAD INFORMATION:\n${leadContext}\n\n` : ''}NOTES:\n${notesContext}

Requirements:
- Summary should be under ${maxLength} characters
- Extract 3-5 key highlights
- List any action items or pending tasks
- Note any important dates mentioned

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
    const parsed = parseJsonResponse<SummarizationOutput>(responseText);

    if (!parsed) {
      // If parsing fails, create a basic summary from the response
      return successResult(
        {
          summary: responseText.slice(0, maxLength),
          highlights: [],
          actionItems: [],
          keyDates: [],
        },
        {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      );
    }

    return successResult(parsed, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Summarization error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Summarization failed'
    );
  }
}

/**
 * Summarize a single note
 */
export async function summarizeNote(
  noteText: string,
  context?: { leadName?: string; leadType?: string }
): Promise<AgentResult<string>> {
  try {
    const userPrompt = `Summarize this sales note in 1-2 sentences:

${context?.leadName ? `Lead: ${context.leadName}` : ''}
${context?.leadType ? `Type: ${context.leadType}` : ''}

Note: ${noteText}

Return ONLY the summary, nothing else.`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      system:
        'You are a concise assistant that summarizes sales notes. Respond with only the summary.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const summary =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    return successResult(summary, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Note summarization error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Note summarization failed'
    );
  }
}

export default {
  summarize,
  summarizeNote,
};
