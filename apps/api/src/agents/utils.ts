import Anthropic from '@anthropic-ai/sdk';
import type { AgentResult } from './types';

// Initialize Anthropic client
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model for agents
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Create a successful agent result
 */
export function successResult<T>(
  data: T,
  usage?: { inputTokens: number; outputTokens: number }
): AgentResult<T> {
  return {
    success: true,
    data,
    usage,
  };
}

/**
 * Create an error agent result
 */
export function errorResult<T>(error: string): AgentResult<T> {
  return {
    success: false,
    data: null,
    error,
  };
}

/**
 * Parse JSON from Claude response, handling code blocks
 */
export function parseJsonResponse<T>(text: string): T | null {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        return null;
      }
    }

    // Try to find JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

/**
 * Format notes for AI context
 */
export function formatNotesForContext(
  notes: Array<{
    date: string;
    text: string;
    staff_id?: string | null;
    ai_summary?: string | null;
  }>
): string {
  return notes
    .map(
      (note, i) =>
        `Note ${i + 1} (${note.date}):\n${note.text}${
          note.ai_summary ? `\nAI Summary: ${note.ai_summary}` : ''
        }`
    )
    .join('\n\n');
}

/**
 * Format lead for AI context
 */
export function formatLeadForContext(lead: {
  name: string;
  contact: string;
  source: string;
  lead_type: string;
  status: string;
  ai_summary?: string | null;
  ai_score?: number | null;
  next_action?: string | null;
  follow_up_date?: string | null;
}): string {
  return `
Lead Name: ${lead.name}
Contact: ${lead.contact}
Source: ${lead.source}
Type: ${lead.lead_type}
Status: ${lead.status}
${lead.ai_score ? `Current AI Score: ${Math.round(lead.ai_score * 100)}%` : ''}
${lead.ai_summary ? `Current Summary: ${lead.ai_summary}` : ''}
${lead.next_action ? `Pending Action: ${lead.next_action}` : ''}
${lead.follow_up_date ? `Follow-up Date: ${lead.follow_up_date}` : ''}
`.trim();
}

/**
 * Generate unique ID for suggestions
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate days since date
 */
export function daysSince(date: string | Date): number {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Retry wrapper for API calls
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
}
