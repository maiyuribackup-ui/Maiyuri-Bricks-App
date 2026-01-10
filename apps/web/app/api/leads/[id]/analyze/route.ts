import { NextRequest } from 'next/server';
import { kernels, services } from '@maiyuri/api';
import { success, error, notFound } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/supabase-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Helper to get user's language preference
async function getUserLanguagePreference(request: NextRequest): Promise<'en' | 'ta'> {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) return 'en';

    const { data: user } = await getSupabaseAdmin()
      .from('users')
      .select('language_preference')
      .eq('id', authUser.id)
      .single();

    return (user?.language_preference as 'en' | 'ta') || 'en';
  } catch {
    return 'en';
  }
}

// POST /api/leads/[id]/analyze - Analyze a lead with AI using CloudCore
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    // Use CloudCore's lead analyst kernel for full analysis
    const result = await kernels.leadAnalyst.analyze({
      leadId: id,
      analysisType: 'full_analysis',
      language,
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

    // Map factors to the database format
    const aiFactors = result.data.score?.factors?.map((f) => ({
      factor: f.name,
      impact: f.impact as 'positive' | 'negative' | 'neutral',
    }));

    // Map suggestions to the database format
    const aiSuggestions = result.data.suggestions?.items?.map((s) => ({
      type: s.type,
      content: s.content,
      priority: s.priority as 'high' | 'medium' | 'low',
    }));

    // Update lead with full AI insights (using snake_case for database)
    const updateResult = await services.supabase.updateLeadAI(id, {
      ai_summary: result.data.summary?.text,
      ai_score: result.data.score?.value,
      ai_factors: aiFactors,
      ai_suggestions: aiSuggestions,
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

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    // Use CloudCore's quick analyze for lightweight analysis
    const result = await kernels.leadAnalyst.quickAnalyze(id, { language });

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
