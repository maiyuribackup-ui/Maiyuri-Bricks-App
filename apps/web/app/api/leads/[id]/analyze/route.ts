import { NextRequest } from 'next/server';
import { kernels, services } from '@maiyuri/api';
import { success, error, notFound } from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/leads/[id]/analyze - Analyze a lead with AI using CloudCore
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Use CloudCore's lead analyst kernel for full analysis
    const result = await kernels.leadAnalyst.analyze({
      leadId: id,
      analysisType: 'full_analysis',
      options: {
        includeSimilarLeads: false,
        includeHistoricalData: false,
        maxNotesToAnalyze: 10,
      },
    });

    if (!result.success || !result.data) {
      if (result.error?.code === 'LEAD_NOT_FOUND') {
        return notFound('Lead not found');
      }
      return error(result.error?.message || 'Analysis failed', 500);
    }

    // Update lead with AI insights (using snake_case for database)
    const updateResult = await services.supabase.updateLeadAI(id, {
      ai_summary: result.data.summary?.text,
      ai_score: result.data.score?.value,
      next_action: result.data.suggestions?.nextBestAction,
      follow_up_date: result.data.suggestions?.suggestedFollowUpDate,
    });

    if (!updateResult.success) {
      console.error('Error updating lead:', updateResult.error);
      return error('Failed to update lead with AI insights', 500);
    }

    // Fetch updated lead
    const leadResult = await services.supabase.getLead(id);

    return success({
      lead: leadResult.data,
      analysis: {
        summary: result.data.summary?.text,
        score: result.data.score?.value,
        nextAction: result.data.suggestions?.nextBestAction,
        followUpDate: result.data.suggestions?.suggestedFollowUpDate,
        factors: result.data.score?.factors.map((f) => ({
          factor: f.name,
          impact: f.impact,
        })),
        suggestions: result.data.suggestions?.items.map((s) => ({
          type: s.type,
          content: s.content,
          priority: s.priority,
        })),
      },
    });
  } catch (err) {
    console.error('Error analyzing lead:', err);
    return error('Internal server error', 500);
  }
}

// GET /api/leads/[id]/analyze - Quick analysis (lightweight)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Use CloudCore's quick analyze for lightweight analysis
    const result = await kernels.leadAnalyst.quickAnalyze(id);

    if (!result.success || !result.data) {
      if (result.error?.code === 'LEAD_NOT_FOUND') {
        return notFound('Lead not found');
      }
      return error(result.error?.message || 'Analysis failed', 500);
    }

    return success(result.data);
  } catch (err) {
    console.error('Error in quick analysis:', err);
    return error('Internal server error', 500);
  }
}
