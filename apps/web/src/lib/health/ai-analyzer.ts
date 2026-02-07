/**
 * AI Health Analyzer
 *
 * Uses Claude Sonnet to analyze health check results,
 * identify correlations, diagnose root causes, and
 * generate actionable recommendations.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  HealthCheckResult,
  AgentGroupResult,
  AIAnalysis,
} from './types';

/**
 * Analyze health check results using Claude Sonnet
 */
export async function analyzeHealthResults(
  agentResults: AgentGroupResult[],
  previousResults: HealthCheckResult[] | null,
): Promise<{ analysis: AIAnalysis; rawPrompt: string; rawResponse: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      analysis: buildFallbackAnalysis(agentResults),
      rawPrompt: '',
      rawResponse: 'ANTHROPIC_API_KEY not configured',
    };
  }

  const prompt = buildAnalysisPrompt(agentResults, previousResults);

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawResponse =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

    const analysis = parseAnalysisResponse(rawResponse);

    return { analysis, rawPrompt: prompt, rawResponse };
  } catch (error) {
    console.error('[HealthCheck] AI analysis failed:', error);

    return {
      analysis: buildFallbackAnalysis(agentResults),
      rawPrompt: prompt,
      rawResponse:
        error instanceof Error ? error.message : 'AI analysis failed',
    };
  }
}

function buildAnalysisPrompt(
  agentResults: AgentGroupResult[],
  previousResults: HealthCheckResult[] | null,
): string {
  const currentResults = agentResults.flatMap((a) =>
    a.checks.map((c) => ({
      group: a.group,
      check: c.checkName,
      service: c.serviceName,
      status: c.status,
      responseMs: c.responseTimeMs,
      error: c.errorMessage ?? null,
    })),
  );

  const previousSummary = previousResults
    ? previousResults.map((c) => ({
        check: c.checkName,
        status: c.status,
        responseMs: c.responseTimeMs,
        error: c.errorMessage ?? null,
      }))
    : null;

  return `You are a systems reliability analyst for a brick manufacturing business's lead management app (Maiyuri Bricks). The app uses Supabase, Telegram bots, Odoo CRM, Claude AI, Gemini AI, Resend email, and a Railway worker for audio processing.

Analyze these health check results and respond in EXACTLY this JSON format:
{"overallStatus":"HEALTHY|DEGRADED|CRITICAL","diagnosis":"1-2 sentences","correlations":"related failures or null","actionItems":["item1","item2"],"businessImpact":"user-facing impact or null"}

Current results: ${JSON.stringify(currentResults)}
${previousSummary ? `Previous run: ${JSON.stringify(previousSummary)}` : 'No previous run data.'}

Rules:
- HEALTHY: All checks healthy or only minor degradation
- DEGRADED: Some services impaired but core features work
- CRITICAL: Core services down, users are impacted
- Keep diagnosis concise and actionable
- Correlate related failures (e.g., DB slow + sync errors = connection issue)
- actionItems should be specific steps to fix issues (empty array if all healthy)
- businessImpact should describe what users/staff can't do (null if all healthy)`;
}

function parseAnalysisResponse(raw: string): AIAnalysis {
  try {
    // Extract JSON from response (may be wrapped in text)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { overallStatus: 'HEALTHY', diagnosis: raw.slice(0, 200) };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      overallStatus: parsed.overallStatus ?? 'HEALTHY',
      diagnosis: parsed.diagnosis ?? 'Analysis completed.',
      correlations: parsed.correlations ?? undefined,
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems
        : undefined,
      businessImpact: parsed.businessImpact ?? undefined,
    };
  } catch {
    return {
      overallStatus: 'HEALTHY',
      diagnosis: raw.slice(0, 200) || 'Analysis completed.',
    };
  }
}

/**
 * Fallback analysis when AI is unavailable
 */
function buildFallbackAnalysis(agentResults: AgentGroupResult[]): AIAnalysis {
  const allChecks = agentResults.flatMap((a) => a.checks);
  const unhealthy = allChecks.filter((c) => c.status === 'unhealthy');
  const degraded = allChecks.filter((c) => c.status === 'degraded');

  if (unhealthy.length > 0) {
    return {
      overallStatus: 'CRITICAL',
      diagnosis: `${unhealthy.length} service(s) unhealthy: ${unhealthy.map((c) => c.serviceName).join(', ')}. Immediate attention required.`,
      actionItems: unhealthy.map(
        (c) =>
          `Fix ${c.serviceName}: ${c.errorMessage ?? 'Check service status'}`,
      ),
      businessImpact: `Users may be unable to use features dependent on: ${unhealthy.map((c) => c.serviceName).join(', ')}.`,
    };
  }

  if (degraded.length > 0) {
    return {
      overallStatus: 'DEGRADED',
      diagnosis: `${degraded.length} service(s) degraded: ${degraded.map((c) => c.serviceName).join(', ')}. Performance may be impacted.`,
      actionItems: degraded.map(
        (c) =>
          `Monitor ${c.serviceName}: ${c.errorMessage ?? 'Slow response times'}`,
      ),
    };
  }

  return {
    overallStatus: 'HEALTHY',
    diagnosis:
      'All systems operational. No issues detected across infrastructure, external services, and business logic.',
  };
}
