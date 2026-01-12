/**
 * Report Agent
 * Generates formatted reports for leads and staff performance
 */

import {
  anthropic,
  DEFAULT_MODEL,
  successResult,
  errorResult,
  parseJsonResponse,
  formatNotesForContext,
  formatLeadForContext,
} from '../utils';
import type { AgentResult, ScoringInput } from '../types';

// Report Types
export interface ReportInput {
  type: 'lead_summary' | 'staff_performance' | 'pipeline_overview' | 'conversion_analysis';
  leads?: ScoringInput['lead'][];
  notes?: ScoringInput['notes'];
  dateRange?: {
    start: string;
    end: string;
  };
  staffId?: string;
  format?: 'text' | 'html' | 'markdown';
}

export interface ReportOutput {
  title: string;
  generatedAt: string;
  summary: string;
  sections: ReportSection[];
  metrics?: ReportMetrics;
  recommendations?: string[];
}

export interface ReportSection {
  title: string;
  content: string;
  data?: Record<string, unknown>;
}

export interface ReportMetrics {
  totalLeads?: number;
  convertedLeads?: number;
  conversionRate?: number;
  averageScore?: number;
  totalInteractions?: number;
  hotLeads?: number;
  coldLeads?: number;
}

const SYSTEM_PROMPT = `You are an AI assistant that generates professional business reports for a brick manufacturing company.

Your role is to:
1. Analyze lead and performance data
2. Generate clear, actionable reports
3. Highlight key metrics and trends
4. Provide data-driven recommendations

Report Guidelines:
- Use clear, professional language
- Include specific numbers and percentages
- Highlight both successes and areas for improvement
- Provide actionable next steps
- Keep sections concise but informative

Output Format:
Always respond with a JSON object:
{
  "title": "Report Title",
  "summary": "Executive summary in 2-3 sentences",
  "sections": [
    {"title": "Section Name", "content": "Section content..."}
  ],
  "metrics": {
    "totalLeads": 50,
    "convertedLeads": 10,
    "conversionRate": 0.2
  },
  "recommendations": [
    "First recommendation",
    "Second recommendation"
  ]
}`;

/**
 * Generate a report based on input data
 */
export async function generateReport(
  input: ReportInput
): Promise<AgentResult<ReportOutput>> {
  try {
    const { type, leads = [], notes = [], dateRange, format = 'markdown' } = input;

    // Build context based on report type
    let contextData = '';

    switch (type) {
      case 'lead_summary':
        contextData = buildLeadSummaryContext(leads, notes);
        break;
      case 'staff_performance':
        contextData = buildStaffPerformanceContext(leads, notes, input.staffId);
        break;
      case 'pipeline_overview':
        contextData = buildPipelineContext(leads);
        break;
      case 'conversion_analysis':
        contextData = buildConversionContext(leads);
        break;
    }

    const userPrompt = `Generate a ${type.replace(/_/g, ' ')} report in ${format} format.

${dateRange ? `Date Range: ${dateRange.start} to ${dateRange.end}` : ''}

DATA:
${contextData}

Analyze the data and generate a comprehensive report.
Respond ONLY with the JSON object, no other text.`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const parsed = parseJsonResponse<Omit<ReportOutput, 'generatedAt'>>(responseText);

    if (!parsed) {
      return errorResult('Failed to parse report response');
    }

    const report: ReportOutput = {
      ...parsed,
      generatedAt: new Date().toISOString(),
    };

    return successResult(report, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return errorResult(
      error instanceof Error ? error.message : 'Report generation failed'
    );
  }
}

/**
 * Generate a quick lead status report without AI
 */
export function generateQuickReport(leads: ScoringInput['lead'][]): ReportOutput {
  const metrics = calculateMetrics(leads);
  const statusBreakdown = getStatusBreakdown(leads);

  return {
    title: 'Lead Status Report',
    generatedAt: new Date().toISOString(),
    summary: `Overview of ${metrics.totalLeads} leads with ${metrics.conversionRate}% conversion rate.`,
    sections: [
      {
        title: 'Status Breakdown',
        content: Object.entries(statusBreakdown)
          .map(([status, count]) => `- ${status}: ${count} leads`)
          .join('\n'),
        data: statusBreakdown,
      },
      {
        title: 'Key Metrics',
        content: `Total Leads: ${metrics.totalLeads}\nHot Leads: ${metrics.hotLeads}\nConverted: ${metrics.convertedLeads}`,
        data: metrics as unknown as Record<string, unknown>,
      },
    ],
    metrics,
    recommendations: generateQuickRecommendations(metrics, statusBreakdown),
  };
}

// Helper Functions

function buildLeadSummaryContext(
  leads: ScoringInput['lead'][],
  notes: ScoringInput['notes']
): string {
  const leadsContext = leads
    .slice(0, 20)
    .map((lead) => formatLeadForContext(lead))
    .join('\n---\n');

  const notesContext = formatNotesForContext(
    notes.slice(0, 30).map((n) => ({
      date: n.created_at,
      text: n.text,
      ai_summary: n.ai_summary,
    }))
  );

  return `LEADS:\n${leadsContext}\n\nRECENT NOTES:\n${notesContext}`;
}

function buildStaffPerformanceContext(
  leads: ScoringInput['lead'][],
  notes: ScoringInput['notes'],
  staffId?: string
): string {
  const staffLeads = staffId
    ? leads.filter((l) => l.assigned_staff === staffId)
    : leads;

  const staffNotes = staffId
    ? notes.filter((n) => n.staff_id === staffId)
    : notes;

  return `ASSIGNED LEADS: ${staffLeads.length}
CONVERTED LEADS: ${staffLeads.filter((l) => l.status === 'converted').length}
TOTAL NOTES: ${staffNotes.length}

LEAD DETAILS:
${staffLeads.slice(0, 10).map((l) => `- ${l.name} (${l.status})`).join('\n')}`;
}

function buildPipelineContext(leads: ScoringInput['lead'][]): string {
  const statusBreakdown = getStatusBreakdown(leads);

  return `PIPELINE STATUS:
${Object.entries(statusBreakdown)
  .map(([status, count]) => `- ${status}: ${count}`)
  .join('\n')}

TOTAL VALUE: ${leads.length} leads in pipeline`;
}

function buildConversionContext(leads: ScoringInput['lead'][]): string {
  const converted = leads.filter((l) => l.status === 'converted');
  const lost = leads.filter((l) => l.status === 'lost');

  return `CONVERSION ANALYSIS:
Total Leads: ${leads.length}
Converted: ${converted.length}
Lost: ${lost.length}
Conversion Rate: ${leads.length > 0 ? ((converted.length / leads.length) * 100).toFixed(1) : 0}%

CONVERTED LEAD SOURCES:
${getSourceBreakdown(converted)}

LOST LEAD SOURCES:
${getSourceBreakdown(lost)}`;
}

function calculateMetrics(leads: ScoringInput['lead'][]): ReportMetrics {
  const converted = leads.filter((l) => l.status === 'converted').length;
  const hot = leads.filter((l) => l.status === 'hot').length;
  const cold = leads.filter((l) => l.status === 'cold').length;
  const scores = leads
    .map((l) => l.ai_score)
    .filter((s): s is number => s !== null && s !== undefined);

  return {
    totalLeads: leads.length,
    convertedLeads: converted,
    conversionRate: leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0,
    averageScore: scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
      : undefined,
    hotLeads: hot,
    coldLeads: cold,
  };
}

function getStatusBreakdown(leads: ScoringInput['lead'][]): Record<string, number> {
  return leads.reduce(
    (acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function getSourceBreakdown(leads: ScoringInput['lead'][]): string {
  const sources = leads.reduce(
    (acc, lead) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(sources)
    .map(([source, count]) => `- ${source}: ${count}`)
    .join('\n');
}

function generateQuickRecommendations(
  metrics: ReportMetrics,
  statusBreakdown: Record<string, number>
): string[] {
  const recommendations: string[] = [];

  if ((metrics.conversionRate ?? 0) < 20) {
    recommendations.push('Conversion rate is below target. Review lead qualification process.');
  }

  if ((metrics.hotLeads ?? 0) > 10) {
    recommendations.push(`${metrics.hotLeads} hot leads need immediate attention.`);
  }

  if ((statusBreakdown['new'] ?? 0) > 20) {
    recommendations.push(`${statusBreakdown['new']} new leads pending first contact.`);
  }

  if ((metrics.coldLeads ?? 0) > (metrics.totalLeads ?? 1) * 0.3) {
    recommendations.push('High percentage of cold leads. Consider re-engagement campaign.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Pipeline is healthy. Continue current practices.');
  }

  return recommendations;
}

export default {
  generateReport,
  generateQuickReport,
};
