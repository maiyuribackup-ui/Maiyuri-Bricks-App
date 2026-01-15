/**
 * AI Analysis Service
 *
 * Analyzes call transcripts to extract insights, signals, and recommendations.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { log, logError } from './logger.js';

// Types
interface CallInsights {
  complaints?: string[];
  negative_feedback?: string[];
  negotiation_signals?: string[];
  price_expectations?: string[];
  positive_signals?: string[];
  recommended_actions?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

interface AnalysisResult {
  summary: string;
  insights: CallInsights;
  scoreImpact: number;
}

/**
 * Get Gemini client
 */
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing GOOGLE_AI_API_KEY');
  }

  return new GoogleGenerativeAI(apiKey);
}

/**
 * Analyze call transcript for sales insights
 */
export async function analyzeTranscript(
  transcript: string,
  phoneNumber: string,
  leadName?: string
): Promise<AnalysisResult> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a sales intelligence analyst for Maiyuri Bricks, a company that manufactures eco-friendly compressed earth blocks (CSEB/interlocking bricks).

Analyze this sales call transcript and provide insights in the following JSON format:

\`\`\`json
{
  "summary": "2-3 sentence summary of the call",
  "sentiment": "positive|negative|neutral|mixed",
  "complaints": ["list of customer complaints or concerns"],
  "negative_feedback": ["negative comments about products/service"],
  "negotiation_signals": ["price negotiation hints, competitor mentions"],
  "price_expectations": ["budget mentions, price expectations"],
  "positive_signals": ["buying intent signals, interest indicators"],
  "recommended_actions": ["specific next steps for the sales team"],
  "score_impact": 0.15
}
\`\`\`

Guidelines:
- score_impact should be between -0.3 and +0.3 indicating how this call affects conversion probability
- Positive signals, clear requirements, budget discussion → positive impact
- Complaints, strong price objections, competitor preference → negative impact
- If transcript is in Tamil, provide insights in English
- Focus on actionable intelligence for the sales team
- Keep lists concise (max 3-4 items each)

Customer: ${leadName || 'Unknown'} (${phoneNumber})

Transcript:
${transcript}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON from response
    const analysis = parseAnalysisResponse(response);

    log('Analysis complete', {
      sentiment: analysis.insights.sentiment,
      scoreImpact: analysis.scoreImpact,
    });

    return analysis;
  } catch (error) {
    logError('Analysis failed', error);

    // Return default analysis on failure
    return {
      summary: 'Analysis unavailable - error processing transcript',
      insights: {
        sentiment: 'neutral',
        recommended_actions: ['Review call recording manually'],
      },
      scoreImpact: 0,
    };
  }
}

/**
 * Parse the analysis response and extract structured data
 */
function parseAnalysisResponse(response: string): AnalysisResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Validate and structure the response
    return {
      summary: parsed.summary || 'Summary unavailable',
      insights: {
        complaints: ensureStringArray(parsed.complaints),
        negative_feedback: ensureStringArray(parsed.negative_feedback),
        negotiation_signals: ensureStringArray(parsed.negotiation_signals),
        price_expectations: ensureStringArray(parsed.price_expectations),
        positive_signals: ensureStringArray(parsed.positive_signals),
        recommended_actions: ensureStringArray(parsed.recommended_actions),
        sentiment: validateSentiment(parsed.sentiment),
      },
      scoreImpact: clampNumber(parsed.score_impact, -0.3, 0.3),
    };
  } catch (error) {
    logError('Failed to parse analysis response', error);

    // Return minimal valid response
    return {
      summary: response.slice(0, 500), // Use raw response as summary
      insights: {
        sentiment: 'neutral',
      },
      scoreImpact: 0,
    };
  }
}

/**
 * Ensure value is array of strings
 */
function ensureStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return undefined;
  return value.filter((v) => typeof v === 'string').slice(0, 5);
}

/**
 * Validate sentiment value
 */
function validateSentiment(
  value: unknown
): 'positive' | 'negative' | 'neutral' | 'mixed' {
  const valid = ['positive', 'negative', 'neutral', 'mixed'];
  return valid.includes(String(value))
    ? (String(value) as 'positive' | 'negative' | 'neutral' | 'mixed')
    : 'neutral';
}

/**
 * Clamp number to range
 */
function clampNumber(value: unknown, min: number, max: number): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(min, Math.min(max, num));
}

/**
 * Generate quick assessment without full analysis
 */
export async function quickAssessment(
  transcript: string
): Promise<{
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  urgency: 'high' | 'medium' | 'low';
}> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Quickly assess this sales call:

1. Overall sentiment: positive, negative, neutral, or mixed?
2. Urgency to follow up: high, medium, or low?

Reply in format: SENTIMENT, URGENCY

Transcript:
${transcript.slice(0, 2000)}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().toLowerCase();

    let sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
    let urgency: 'high' | 'medium' | 'low' = 'medium';

    if (response.includes('positive')) sentiment = 'positive';
    else if (response.includes('negative')) sentiment = 'negative';
    else if (response.includes('mixed')) sentiment = 'mixed';

    if (response.includes('high')) urgency = 'high';
    else if (response.includes('low')) urgency = 'low';

    return { sentiment, urgency };
  } catch {
    return { sentiment: 'neutral', urgency: 'medium' };
  }
}
