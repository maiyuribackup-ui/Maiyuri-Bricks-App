import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, notFound } from '@/lib/api-utils';
import type { Lead, Note } from '@maiyuri/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const anthropic = new Anthropic();

// POST /api/leads/[id]/analyze - Analyze a lead with AI
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Fetch lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return notFound('Lead not found');
    }

    // Fetch notes
    const { data: notes } = await supabaseAdmin
      .from('notes')
      .select('*')
      .eq('lead_id', id)
      .order('date', { ascending: false });

    const notesList = notes || [];

    // Build context for AI
    const leadContext = buildLeadContext(lead, notesList);

    // Call Claude for analysis
    const analysis = await analyzeWithClaude(leadContext, lead, notesList);

    // Update lead with AI insights
    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update({
        ai_summary: analysis.summary,
        ai_score: analysis.score,
        next_action: analysis.nextAction,
        follow_up_date: analysis.followUpDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating lead:', updateError);
      return error('Failed to update lead with AI insights', 500);
    }

    // Fetch updated lead
    const { data: updatedLead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    return success({
      lead: updatedLead,
      analysis: {
        summary: analysis.summary,
        score: analysis.score,
        nextAction: analysis.nextAction,
        followUpDate: analysis.followUpDate,
        factors: analysis.factors,
        suggestions: analysis.suggestions,
      },
    });
  } catch (err) {
    console.error('Error analyzing lead:', err);
    return error('Internal server error', 500);
  }
}

function buildLeadContext(lead: Lead, notes: Note[]): string {
  let context = `Lead Information:
- Name: ${lead.name}
- Contact: ${lead.contact}
- Source: ${lead.source}
- Type: ${lead.lead_type}
- Current Status: ${lead.status}
- Created: ${new Date(lead.created_at).toLocaleDateString()}
- Days since creation: ${Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))}
`;

  if (lead.next_action) {
    context += `- Current Next Action: ${lead.next_action}\n`;
  }

  if (lead.follow_up_date) {
    context += `- Current Follow-up Date: ${new Date(lead.follow_up_date).toLocaleDateString()}\n`;
  }

  if (notes.length > 0) {
    context += `\nInteraction Notes (${notes.length} total):\n`;
    notes.slice(0, 10).forEach((note, index) => {
      context += `\n[Note ${index + 1} - ${new Date(note.date).toLocaleDateString()}]\n`;
      context += note.text;
      if (note.ai_summary) {
        context += `\n(Previous AI Summary: ${note.ai_summary})`;
      }
      context += '\n';
    });
  } else {
    context += '\nNo interaction notes yet.\n';
  }

  return context;
}

interface AnalysisResult {
  summary: string;
  score: number;
  nextAction: string;
  followUpDate: string | null;
  factors: { factor: string; impact: 'positive' | 'negative' | 'neutral' }[];
  suggestions: { type: string; content: string; priority: string }[];
}

async function analyzeWithClaude(
  context: string,
  lead: Lead,
  notes: Note[]
): Promise<AnalysisResult> {
  const prompt = `You are an AI assistant for a brick manufacturing business analyzing leads. Based on the following lead information and interaction notes, provide a comprehensive analysis.

${context}

Please provide:
1. A brief summary (2-3 sentences) of this lead's status and key points
2. A conversion probability score between 0 and 1 (0 = very unlikely, 1 = very likely)
3. The recommended next action to take
4. A suggested follow-up date (if applicable, in YYYY-MM-DD format)
5. Key factors affecting this score (positive, negative, or neutral)
6. Additional suggestions for engaging with this lead

Respond ONLY with a JSON object in this exact format:
{
  "summary": "Brief summary of the lead...",
  "score": 0.65,
  "nextAction": "Call to discuss pricing and specifications",
  "followUpDate": "2025-01-10",
  "factors": [
    {"factor": "Multiple positive interactions", "impact": "positive"},
    {"factor": "Long time since last contact", "impact": "negative"}
  ],
  "suggestions": [
    {"type": "action", "content": "Send product catalog", "priority": "high"},
    {"type": "insight", "content": "Consider offering volume discount", "priority": "medium"}
  ]
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content
    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response');
    }

    const analysis = JSON.parse(jsonMatch[0]) as AnalysisResult;

    // Validate and clamp score
    analysis.score = Math.max(0, Math.min(1, analysis.score));

    return analysis;
  } catch (err) {
    console.error('Error calling Claude:', err);

    // Return fallback analysis based on lead data
    return generateFallbackAnalysis(lead, notes);
  }
}

function generateFallbackAnalysis(lead: Lead, notes: Note[]): AnalysisResult {
  const daysSinceCreation = Math.floor(
    (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  const noteCount = notes.length;

  // Simple scoring based on available data
  let score = 0.5;
  const factors: { factor: string; impact: 'positive' | 'negative' | 'neutral' }[] = [];

  // Status-based scoring
  if (lead.status === 'hot') {
    score += 0.2;
    factors.push({ factor: 'Lead marked as hot', impact: 'positive' });
  } else if (lead.status === 'cold') {
    score -= 0.2;
    factors.push({ factor: 'Lead marked as cold', impact: 'negative' });
  }

  // Note count scoring
  if (noteCount >= 5) {
    score += 0.1;
    factors.push({ factor: 'Multiple interactions recorded', impact: 'positive' });
  } else if (noteCount === 0) {
    score -= 0.1;
    factors.push({ factor: 'No interaction notes', impact: 'negative' });
  }

  // Age scoring
  if (daysSinceCreation > 30 && lead.status !== 'converted') {
    score -= 0.1;
    factors.push({ factor: 'Lead is over 30 days old', impact: 'negative' });
  }

  score = Math.max(0.1, Math.min(0.9, score));

  // Generate suggestions based on status
  const suggestions: { type: string; content: string; priority: string }[] = [];

  if (lead.status === 'new') {
    suggestions.push({
      type: 'action',
      content: 'Make initial contact to qualify lead requirements',
      priority: 'high',
    });
  } else if (lead.status === 'hot') {
    suggestions.push({
      type: 'action',
      content: 'Schedule meeting to close the deal',
      priority: 'high',
    });
  } else if (lead.status === 'cold') {
    suggestions.push({
      type: 'action',
      content: 'Send re-engagement message with special offer',
      priority: 'medium',
    });
  }

  // Calculate follow-up date
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + (lead.status === 'hot' ? 2 : 7));

  return {
    summary: `${lead.name} is a ${lead.status} lead from ${lead.source} interested in ${lead.lead_type} products. ${noteCount > 0 ? `There are ${noteCount} interaction notes recorded.` : 'No interaction notes have been recorded yet.'}`,
    score,
    nextAction: suggestions[0]?.content || 'Follow up with lead',
    followUpDate: followUpDate.toISOString().split('T')[0],
    factors,
    suggestions,
  };
}
