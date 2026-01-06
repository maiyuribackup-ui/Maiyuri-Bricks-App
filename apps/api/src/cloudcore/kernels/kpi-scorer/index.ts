/**
 * KPI Scorer Kernel
 * AI-powered KPI scoring for leads, staff, and business metrics
 * Uses Gemini for intelligent analysis and scoring
 */

import * as gemini from '../../services/ai/gemini';
import * as db from '../../services/supabase';
import type {
  CloudCoreResult,
  LeadKPIRequest,
  LeadKPIScore,
  LeadKPIResponse,
  StaffKPIRequest,
  StaffKPIScore,
  StaffKPIResponse,
  BusinessKPIRequest,
  BusinessKPIScore,
  BusinessKPIResponse,
  KPIFactor,
  KPIAlert,
  KPIDashboardResponse,
  KPITimeRange,
  KPITrend,
  KPIUrgency,
} from '../../types';

export const KERNEL_CONFIG = {
  name: 'KPIScorer',
  description: 'AI-powered KPI scoring for leads, staff, and business metrics',
  version: '1.0.0',
  defaultModel: 'gemini-2.5-flash',
  maxTokens: 2048,
  temperature: 0.3,
};

// Scoring weights
const LEAD_WEIGHTS = {
  engagementRecency: 0.25,
  followUpCompliance: 0.20,
  noteDensity: 0.15,
  sentimentTrend: 0.15,
  conversionSignals: 0.15,
  responseTime: 0.10,
};

const STAFF_WEIGHTS = {
  conversionRate: 0.25,
  responseSpeed: 0.20,
  followUpRate: 0.20,
  leadEngagement: 0.15,
  hotLeadHandling: 0.10,
  customerSatisfaction: 0.10,
};

const BUSINESS_WEIGHTS = {
  pipelineValue: 0.25,
  conversionVelocity: 0.20,
  leadFlow: 0.20,
  teamEfficiency: 0.15,
  forecastAccuracy: 0.10,
  knowledgeUtilization: 0.10,
};

/**
 * Get date range for time period
 */
function getDateRange(timeRange: KPITimeRange = 'month'): { start: Date; end: Date } {
  const end = new Date();
  let start: Date;

  switch (timeRange) {
    case 'day':
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
  }

  return { start, end };
}

/**
 * Calculate trend based on current vs previous value
 */
function calculateTrend(current: number, previous: number): KPITrend {
  const change = ((current - previous) / Math.max(previous, 1)) * 100;
  if (change > 5) return 'up';
  if (change < -5) return 'down';
  return 'stable';
}

/**
 * Determine urgency based on score
 */
function getUrgency(score: number): KPIUrgency {
  if (score < 40) return 'high';
  if (score < 70) return 'medium';
  return 'low';
}

// ============================================
// Lead KPI Functions
// ============================================

/**
 * Calculate KPI score for a single lead
 */
async function calculateSingleLeadKPI(
  leadId: string,
  timeRange: KPITimeRange
): Promise<CloudCoreResult<LeadKPIScore>> {
  const startTime = Date.now();
  const { start } = getDateRange(timeRange);

  try {
    // Get lead data
    const { data: lead, error: leadError } = await db.supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return {
        success: false,
        data: null,
        error: { code: 'LEAD_NOT_FOUND', message: `Lead not found: ${leadId}` },
      };
    }

    // Get notes for this lead
    const { data: notes } = await db.supabase
      .from('notes')
      .select('*')
      .eq('lead_id', leadId)
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false });

    const recentNotes = notes || [];

    // Calculate individual factors
    const factors: KPIFactor[] = [];
    let totalScore = 0;

    // 1. Engagement Recency (days since last contact)
    const lastNoteDate = recentNotes[0]?.created_at
      ? new Date(recentNotes[0].created_at)
      : lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at);
    const daysSinceContact = Math.floor((Date.now() - lastNoteDate.getTime()) / (24 * 60 * 60 * 1000));
    const recencyScore = Math.max(0, 100 - (daysSinceContact * 10)); // Lose 10 points per day
    factors.push({
      name: 'Engagement Recency',
      impact: recencyScore > 70 ? 'positive' : recencyScore > 40 ? 'neutral' : 'negative',
      weight: LEAD_WEIGHTS.engagementRecency,
      currentValue: daysSinceContact,
      targetValue: 3,
      description: `${daysSinceContact} days since last contact`,
    });
    totalScore += recencyScore * LEAD_WEIGHTS.engagementRecency;

    // 2. Follow-up Compliance
    const hasFollowUp = lead.follow_up_date !== null;
    const followUpDate = lead.follow_up_date ? new Date(lead.follow_up_date) : null;
    const isOverdue = followUpDate && followUpDate < new Date();
    const followUpScore = !hasFollowUp ? 50 : (isOverdue ? 20 : 100);
    factors.push({
      name: 'Follow-up Compliance',
      impact: followUpScore > 70 ? 'positive' : followUpScore > 40 ? 'neutral' : 'negative',
      weight: LEAD_WEIGHTS.followUpCompliance,
      currentValue: followUpScore,
      targetValue: 100,
      description: isOverdue ? 'Follow-up overdue' : (hasFollowUp ? 'Follow-up scheduled' : 'No follow-up set'),
    });
    totalScore += followUpScore * LEAD_WEIGHTS.followUpCompliance;

    // 3. Note Density (notes per week)
    const weeksInPeriod = Math.max(1, Math.ceil((Date.now() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const notesPerWeek = recentNotes.length / weeksInPeriod;
    const densityScore = Math.min(100, notesPerWeek * 33); // 3 notes/week = 100
    factors.push({
      name: 'Note Density',
      impact: densityScore > 70 ? 'positive' : densityScore > 40 ? 'neutral' : 'negative',
      weight: LEAD_WEIGHTS.noteDensity,
      currentValue: Number(notesPerWeek.toFixed(1)),
      targetValue: 3,
      description: `${notesPerWeek.toFixed(1)} notes per week`,
    });
    totalScore += densityScore * LEAD_WEIGHTS.noteDensity;

    // 4-6. AI-enhanced scoring (sentiment, conversion signals, response time)
    let aiScore = 50; // Default
    let recommendation = 'Continue regular engagement';

    if (recentNotes.length > 0) {
      const noteTexts = recentNotes.slice(0, 5).map(n => n.text).join('\n---\n');
      const aiResult = await analyzeLeadWithAI(lead.name, lead.status, noteTexts);
      if (aiResult.success && aiResult.data) {
        aiScore = aiResult.data.score;
        recommendation = aiResult.data.recommendation;

        factors.push({
          name: 'Sentiment Analysis',
          impact: aiResult.data.sentiment === 'positive' ? 'positive' :
                  aiResult.data.sentiment === 'negative' ? 'negative' : 'neutral',
          weight: LEAD_WEIGHTS.sentimentTrend,
          currentValue: aiResult.data.sentimentScore,
          description: `AI-detected ${aiResult.data.sentiment} sentiment`,
        });
        totalScore += aiResult.data.sentimentScore * LEAD_WEIGHTS.sentimentTrend;

        factors.push({
          name: 'Conversion Signals',
          impact: aiResult.data.conversionSignals > 70 ? 'positive' :
                  aiResult.data.conversionSignals > 40 ? 'neutral' : 'negative',
          weight: LEAD_WEIGHTS.conversionSignals,
          currentValue: aiResult.data.conversionSignals,
          description: aiResult.data.conversionDescription,
        });
        totalScore += aiResult.data.conversionSignals * LEAD_WEIGHTS.conversionSignals;
      }
    } else {
      // No notes - use defaults
      factors.push({
        name: 'Sentiment Analysis',
        impact: 'neutral',
        weight: LEAD_WEIGHTS.sentimentTrend,
        currentValue: 50,
        description: 'No recent notes to analyze',
      });
      totalScore += 50 * LEAD_WEIGHTS.sentimentTrend;

      factors.push({
        name: 'Conversion Signals',
        impact: 'neutral',
        weight: LEAD_WEIGHTS.conversionSignals,
        currentValue: 50,
        description: 'Insufficient data',
      });
      totalScore += 50 * LEAD_WEIGHTS.conversionSignals;
    }

    // Response time (estimated based on note frequency)
    const responseScore = Math.min(100, notesPerWeek > 2 ? 90 : notesPerWeek * 40);
    factors.push({
      name: 'Response Time',
      impact: responseScore > 70 ? 'positive' : responseScore > 40 ? 'neutral' : 'negative',
      weight: LEAD_WEIGHTS.responseTime,
      currentValue: responseScore,
      description: 'Based on engagement frequency',
    });
    totalScore += responseScore * LEAD_WEIGHTS.responseTime;

    const finalScore = Math.round(totalScore);

    const score: LeadKPIScore = {
      category: 'lead',
      leadId,
      leadName: lead.name,
      status: lead.status,
      value: finalScore,
      trend: 'stable', // Would need historical data to calculate
      confidence: recentNotes.length >= 3 ? 0.85 : 0.6,
      factors,
      daysSinceLastContact: daysSinceContact,
      recommendation,
      urgency: getUrgency(finalScore),
      generatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: score,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Lead KPI calculation error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'LEAD_KPI_ERROR',
        message: error instanceof Error ? error.message : 'Failed to calculate lead KPI',
      },
    };
  }
}

/**
 * AI analysis for lead scoring
 */
async function analyzeLeadWithAI(
  leadName: string,
  status: string,
  noteTexts: string
): Promise<CloudCoreResult<{
  score: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
  conversionSignals: number;
  conversionDescription: string;
  recommendation: string;
}>> {
  const prompt = `Analyze this lead's recent interactions and provide scoring:

Lead: ${leadName}
Status: ${status}
Recent Notes:
${noteTexts}

Respond ONLY with valid JSON in this exact format:
{
  "sentiment": "positive" or "neutral" or "negative",
  "sentimentScore": 0-100,
  "conversionSignals": 0-100,
  "conversionDescription": "brief description of purchase intent signals",
  "recommendation": "one actionable next step"
}

Score meanings:
- sentimentScore: Overall relationship health (100=excellent, 0=poor)
- conversionSignals: Likelihood of purchase intent (100=ready to buy, 0=not interested)`;

  const result = await gemini.complete({ prompt, temperature: 0.2 });

  if (!result.success || !result.data) {
    return { success: false, data: null, error: result.error };
  }

  try {
    const parsed = JSON.parse(result.data.content);
    return {
      success: true,
      data: {
        score: (parsed.sentimentScore + parsed.conversionSignals) / 2,
        sentiment: parsed.sentiment,
        sentimentScore: parsed.sentimentScore,
        conversionSignals: parsed.conversionSignals,
        conversionDescription: parsed.conversionDescription,
        recommendation: parsed.recommendation,
      },
    };
  } catch {
    return {
      success: false,
      data: null,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse AI response' },
    };
  }
}

/**
 * Calculate KPI for all leads or a specific lead
 */
export async function calculateLeadKPI(
  request: LeadKPIRequest
): Promise<CloudCoreResult<LeadKPIResponse>> {
  const startTime = Date.now();
  const timeRange = request.timeRange || 'month';

  try {
    if (request.leadId) {
      // Single lead
      const result = await calculateSingleLeadKPI(request.leadId, timeRange);
      if (!result.success || !result.data) {
        return { success: false, data: null, error: result.error };
      }

      return {
        success: true,
        data: {
          scores: [result.data],
          averageScore: result.data.value,
          topPerformers: [result.data],
          needsAttention: result.data.value < 50 ? [result.data] : [],
        },
        meta: { processingTime: Date.now() - startTime },
      };
    }

    // All leads
    const { data: leads, error } = await db.supabase
      .from('leads')
      .select('id')
      .not('status', 'eq', 'converted')
      .not('status', 'eq', 'lost')
      .limit(50);

    if (error || !leads) {
      return {
        success: false,
        data: null,
        error: { code: 'LEADS_FETCH_ERROR', message: 'Failed to fetch leads' },
      };
    }

    // Calculate KPI for each lead (in parallel with limit)
    const batchSize = 10;
    const allScores: LeadKPIScore[] = [];

    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(lead => calculateSingleLeadKPI(lead.id, timeRange))
      );

      for (const result of results) {
        if (result.success && result.data) {
          allScores.push(result.data);
        }
      }
    }

    // Calculate aggregate metrics
    const averageScore = allScores.length > 0
      ? Math.round(allScores.reduce((sum, s) => sum + s.value, 0) / allScores.length)
      : 0;

    const sorted = [...allScores].sort((a, b) => b.value - a.value);
    const topPerformers = sorted.slice(0, 5);
    const needsAttention = sorted.filter(s => s.value < 50).slice(0, 5);

    return {
      success: true,
      data: {
        scores: allScores,
        averageScore,
        topPerformers,
        needsAttention,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Lead KPI error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'LEAD_KPI_ERROR',
        message: error instanceof Error ? error.message : 'Lead KPI calculation failed',
      },
    };
  }
}

// ============================================
// Staff KPI Functions
// ============================================

/**
 * Calculate KPI for a single staff member
 */
async function calculateSingleStaffKPI(
  staffId: string,
  timeRange: KPITimeRange
): Promise<CloudCoreResult<StaffKPIScore>> {
  const startTime = Date.now();
  const { start } = getDateRange(timeRange);

  try {
    // Get staff user
    const { data: user, error: userError } = await db.supabase
      .from('users')
      .select('*')
      .eq('id', staffId)
      .single();

    if (userError || !user) {
      return {
        success: false,
        data: null,
        error: { code: 'STAFF_NOT_FOUND', message: `Staff not found: ${staffId}` },
      };
    }

    // Get leads assigned to this staff
    const { data: leads } = await db.supabase
      .from('leads')
      .select('id, status, created_at, updated_at, follow_up_date')
      .eq('assigned_staff', staffId)
      .gte('updated_at', start.toISOString());

    const staffLeads = leads || [];
    const leadsHandled = staffLeads.length;
    const convertedLeads = staffLeads.filter(l => l.status === 'converted').length;
    const conversionRate = leadsHandled > 0 ? convertedLeads / leadsHandled : 0;

    // Get notes by this staff
    const { data: notes } = await db.supabase
      .from('notes')
      .select('id, lead_id, created_at')
      .eq('staff_id', staffId)
      .gte('created_at', start.toISOString());

    const staffNotes = notes || [];

    // Calculate factors
    const factors: KPIFactor[] = [];
    let totalScore = 0;

    // 1. Conversion Rate
    const conversionScore = Math.min(100, conversionRate * 400); // 25% = 100
    factors.push({
      name: 'Conversion Rate',
      impact: conversionScore > 70 ? 'positive' : conversionScore > 40 ? 'neutral' : 'negative',
      weight: STAFF_WEIGHTS.conversionRate,
      currentValue: Math.round(conversionRate * 100),
      targetValue: 25,
      description: `${Math.round(conversionRate * 100)}% conversion rate`,
    });
    totalScore += conversionScore * STAFF_WEIGHTS.conversionRate;

    // 2. Response Speed (based on note frequency)
    const notesPerLead = leadsHandled > 0 ? staffNotes.length / leadsHandled : 0;
    const responseScore = Math.min(100, notesPerLead * 25); // 4 notes/lead = 100
    factors.push({
      name: 'Response Speed',
      impact: responseScore > 70 ? 'positive' : responseScore > 40 ? 'neutral' : 'negative',
      weight: STAFF_WEIGHTS.responseSpeed,
      currentValue: Number(notesPerLead.toFixed(1)),
      targetValue: 4,
      description: `${notesPerLead.toFixed(1)} interactions per lead`,
    });
    totalScore += responseScore * STAFF_WEIGHTS.responseSpeed;

    // 3. Follow-up Rate
    const leadsWithFollowUp = staffLeads.filter(l => l.follow_up_date);
    const followUpRate = leadsHandled > 0 ? leadsWithFollowUp.length / leadsHandled : 0;
    const followUpScore = followUpRate * 100;
    factors.push({
      name: 'Follow-up Rate',
      impact: followUpScore > 70 ? 'positive' : followUpScore > 40 ? 'neutral' : 'negative',
      weight: STAFF_WEIGHTS.followUpRate,
      currentValue: Math.round(followUpRate * 100),
      targetValue: 90,
      description: `${Math.round(followUpRate * 100)}% leads have follow-ups`,
    });
    totalScore += followUpScore * STAFF_WEIGHTS.followUpRate;

    // 4. Lead Engagement
    const engagementScore = Math.min(100, (staffNotes.length / Math.max(leadsHandled, 1)) * 33);
    factors.push({
      name: 'Lead Engagement',
      impact: engagementScore > 70 ? 'positive' : engagementScore > 40 ? 'neutral' : 'negative',
      weight: STAFF_WEIGHTS.leadEngagement,
      currentValue: staffNotes.length,
      description: `${staffNotes.length} total interactions`,
    });
    totalScore += engagementScore * STAFF_WEIGHTS.leadEngagement;

    // 5. Hot Lead Handling
    const hotLeads = staffLeads.filter(l => l.status === 'hot' || l.status === 'converted');
    const hotLeadScore = leadsHandled > 0 ? Math.min(100, (hotLeads.length / leadsHandled) * 200) : 50;
    factors.push({
      name: 'Hot Lead Handling',
      impact: hotLeadScore > 70 ? 'positive' : hotLeadScore > 40 ? 'neutral' : 'negative',
      weight: STAFF_WEIGHTS.hotLeadHandling,
      currentValue: hotLeads.length,
      description: `${hotLeads.length} hot/converted leads`,
    });
    totalScore += hotLeadScore * STAFF_WEIGHTS.hotLeadHandling;

    // 6. Customer Satisfaction (estimated from conversion + engagement)
    const satisfactionScore = (conversionScore + engagementScore) / 2;
    factors.push({
      name: 'Customer Satisfaction',
      impact: satisfactionScore > 70 ? 'positive' : satisfactionScore > 40 ? 'neutral' : 'negative',
      weight: STAFF_WEIGHTS.customerSatisfaction,
      currentValue: Math.round(satisfactionScore),
      description: 'Based on conversion and engagement metrics',
    });
    totalScore += satisfactionScore * STAFF_WEIGHTS.customerSatisfaction;

    const finalScore = Math.round(totalScore);

    // AI-generated strengths and improvements
    const { strengths, improvements } = analyzeStaffPerformance(factors);

    const score: StaffKPIScore = {
      category: 'staff',
      staffId,
      staffName: user.name,
      value: finalScore,
      trend: 'stable',
      confidence: leadsHandled >= 5 ? 0.85 : 0.6,
      factors,
      leadsHandled,
      conversionRate: Math.round(conversionRate * 100) / 100,
      avgResponseTime: 4, // Would need more data for actual calculation
      strengths,
      improvements,
      generatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: score,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Staff KPI calculation error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'STAFF_KPI_ERROR',
        message: error instanceof Error ? error.message : 'Failed to calculate staff KPI',
      },
    };
  }
}

/**
 * Analyze staff performance for strengths and improvements
 */
function analyzeStaffPerformance(factors: KPIFactor[]): {
  strengths: string[];
  improvements: string[];
} {
  const strengths: string[] = [];
  const improvements: string[] = [];

  for (const factor of factors) {
    if (factor.impact === 'positive') {
      strengths.push(`Strong ${factor.name.toLowerCase()}`);
    } else if (factor.impact === 'negative') {
      improvements.push(`Improve ${factor.name.toLowerCase()}`);
    }
  }

  return {
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
  };
}

/**
 * Calculate KPI for all staff or a specific staff member
 */
export async function calculateStaffKPI(
  request: StaffKPIRequest
): Promise<CloudCoreResult<StaffKPIResponse>> {
  const startTime = Date.now();
  const timeRange = request.timeRange || 'month';

  try {
    if (request.staffId) {
      const result = await calculateSingleStaffKPI(request.staffId, timeRange);
      if (!result.success || !result.data) {
        return { success: false, data: null, error: result.error };
      }

      return {
        success: true,
        data: {
          scores: [result.data],
          teamAverageScore: result.data.value,
          topPerformers: [result.data],
          coachingNeeded: result.data.value < 60 ? [result.data] : [],
        },
        meta: { processingTime: Date.now() - startTime },
      };
    }

    // All staff
    const { data: users, error } = await db.supabase
      .from('users')
      .select('id')
      .not('role', 'eq', 'founder');

    if (error || !users) {
      return {
        success: false,
        data: null,
        error: { code: 'STAFF_FETCH_ERROR', message: 'Failed to fetch staff' },
      };
    }

    const allScores: StaffKPIScore[] = [];
    for (const user of users) {
      const result = await calculateSingleStaffKPI(user.id, timeRange);
      if (result.success && result.data) {
        allScores.push(result.data);
      }
    }

    const teamAverageScore = allScores.length > 0
      ? Math.round(allScores.reduce((sum, s) => sum + s.value, 0) / allScores.length)
      : 0;

    const sorted = [...allScores].sort((a, b) => b.value - a.value);
    const topPerformers = sorted.slice(0, 3);
    const coachingNeeded = sorted.filter(s => s.value < 60);

    return {
      success: true,
      data: {
        scores: allScores,
        teamAverageScore,
        topPerformers,
        coachingNeeded,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Staff KPI error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'STAFF_KPI_ERROR',
        message: error instanceof Error ? error.message : 'Staff KPI calculation failed',
      },
    };
  }
}

// ============================================
// Business KPI Functions
// ============================================

/**
 * Calculate business-wide KPI
 */
export async function calculateBusinessKPI(
  request: BusinessKPIRequest
): Promise<CloudCoreResult<BusinessKPIResponse>> {
  const startTime = Date.now();
  const timeRange = request.timeRange || 'month';
  const { start, end } = getDateRange(timeRange);
  const compareToPrevious = request.compareToPrevious !== false;

  try {
    // Get all leads in the period
    const { data: leads } = await db.supabase
      .from('leads')
      .select('*')
      .gte('created_at', start.toISOString());

    const periodLeads = leads || [];
    const newLeads = periodLeads.length;
    const convertedLeads = periodLeads.filter(l => l.status === 'converted').length;
    const lostLeads = periodLeads.filter(l => l.status === 'lost').length;
    const hotLeads = periodLeads.filter(l => l.status === 'hot').length;

    // Pipeline value (weighted by status)
    const statusWeights: Record<string, number> = {
      new: 0.1,
      follow_up: 0.3,
      hot: 0.7,
      converted: 1.0,
      cold: 0.05,
      lost: 0,
    };
    const pipelineValue = periodLeads.reduce((sum, lead) => {
      return sum + (statusWeights[lead.status] || 0.1);
    }, 0);

    // Get staff metrics
    const staffResult = await calculateStaffKPI({ timeRange });
    const teamEfficiency = staffResult.success && staffResult.data
      ? staffResult.data.teamAverageScore
      : 50;

    // Calculate factors
    const factors: KPIFactor[] = [];
    let totalScore = 0;

    // 1. Pipeline Value
    const pipelineScore = Math.min(100, (pipelineValue / Math.max(newLeads, 1)) * 100);
    factors.push({
      name: 'Pipeline Value',
      impact: pipelineScore > 70 ? 'positive' : pipelineScore > 40 ? 'neutral' : 'negative',
      weight: BUSINESS_WEIGHTS.pipelineValue,
      currentValue: Math.round(pipelineValue * 10) / 10,
      description: `Weighted pipeline: ${pipelineValue.toFixed(1)} units`,
    });
    totalScore += pipelineScore * BUSINESS_WEIGHTS.pipelineValue;

    // 2. Conversion Velocity
    const conversionRate = newLeads > 0 ? (convertedLeads / newLeads) * 100 : 0;
    const velocityScore = Math.min(100, conversionRate * 4); // 25% = 100
    factors.push({
      name: 'Conversion Velocity',
      impact: velocityScore > 70 ? 'positive' : velocityScore > 40 ? 'neutral' : 'negative',
      weight: BUSINESS_WEIGHTS.conversionVelocity,
      currentValue: Math.round(conversionRate),
      targetValue: 25,
      description: `${conversionRate.toFixed(1)}% conversion rate`,
    });
    totalScore += velocityScore * BUSINESS_WEIGHTS.conversionVelocity;

    // 3. Lead Flow
    const netChange = newLeads - lostLeads;
    const flowScore = Math.min(100, Math.max(0, 50 + (netChange * 5)));
    factors.push({
      name: 'Lead Flow',
      impact: netChange > 0 ? 'positive' : netChange < 0 ? 'negative' : 'neutral',
      weight: BUSINESS_WEIGHTS.leadFlow,
      currentValue: netChange,
      description: `Net: ${netChange > 0 ? '+' : ''}${netChange} leads`,
    });
    totalScore += flowScore * BUSINESS_WEIGHTS.leadFlow;

    // 4. Team Efficiency
    factors.push({
      name: 'Team Efficiency',
      impact: teamEfficiency > 70 ? 'positive' : teamEfficiency > 40 ? 'neutral' : 'negative',
      weight: BUSINESS_WEIGHTS.teamEfficiency,
      currentValue: teamEfficiency,
      targetValue: 80,
      description: `Team average score: ${teamEfficiency}`,
    });
    totalScore += teamEfficiency * BUSINESS_WEIGHTS.teamEfficiency;

    // 5. Forecast Accuracy (simulated)
    const forecastScore = 70; // Would need historical predictions
    factors.push({
      name: 'Forecast Accuracy',
      impact: 'neutral',
      weight: BUSINESS_WEIGHTS.forecastAccuracy,
      currentValue: forecastScore,
      description: 'Prediction accuracy metric',
    });
    totalScore += forecastScore * BUSINESS_WEIGHTS.forecastAccuracy;

    // 6. Knowledge Utilization
    const { data: kbEntries } = await db.supabase
      .from('knowledgebase')
      .select('id')
      .gte('created_at', start.toISOString());
    const kbScore = Math.min(100, (kbEntries?.length || 0) * 20);
    factors.push({
      name: 'Knowledge Utilization',
      impact: kbScore > 50 ? 'positive' : 'neutral',
      weight: BUSINESS_WEIGHTS.knowledgeUtilization,
      currentValue: kbEntries?.length || 0,
      description: `${kbEntries?.length || 0} KB entries created`,
    });
    totalScore += kbScore * BUSINESS_WEIGHTS.knowledgeUtilization;

    const finalScore = Math.round(totalScore);

    // Generate insights
    const insights: string[] = [];
    if (conversionRate > 20) insights.push('Strong conversion performance');
    if (netChange > 5) insights.push('Healthy lead pipeline growth');
    if (hotLeads > newLeads * 0.3) insights.push('High percentage of hot leads');
    if (teamEfficiency > 70) insights.push('Team performing above average');
    if (insights.length === 0) insights.push('Stable business metrics');

    const score: BusinessKPIScore = {
      category: 'business',
      value: finalScore,
      trend: 'stable',
      confidence: 0.75,
      factors,
      pipelineValue,
      conversionVelocity: Math.round(conversionRate * 10) / 10,
      leadFlow: {
        newLeads,
        convertedLeads,
        lostLeads,
        netChange,
      },
      teamEfficiency,
      generatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: {
        score,
        historicalTrend: [], // Would need to store snapshots
        insights,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Business KPI error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'BUSINESS_KPI_ERROR',
        message: error instanceof Error ? error.message : 'Business KPI calculation failed',
      },
    };
  }
}

// ============================================
// Dashboard Function
// ============================================

/**
 * Get complete KPI dashboard data
 */
export async function getDashboardKPIs(): Promise<CloudCoreResult<KPIDashboardResponse>> {
  const startTime = Date.now();

  try {
    // Calculate all KPIs in parallel
    const [leadResult, staffResult, businessResult] = await Promise.all([
      calculateLeadKPI({ timeRange: 'month' }),
      calculateStaffKPI({ timeRange: 'month' }),
      calculateBusinessKPI({ timeRange: 'month' }),
    ]);

    if (!leadResult.success || !staffResult.success || !businessResult.success) {
      return {
        success: false,
        data: null,
        error: { code: 'DASHBOARD_ERROR', message: 'Failed to calculate one or more KPIs' },
      };
    }

    // Generate alerts
    const alerts: KPIAlert[] = [];

    // Lead alerts
    for (const lead of leadResult.data?.needsAttention || []) {
      if (lead.value < 30) {
        alerts.push({
          id: `lead-${lead.leadId}`,
          alertType: 'low_engagement',
          severity: 'critical',
          entityType: 'lead',
          entityId: lead.leadId,
          entityName: lead.leadName,
          message: `Lead "${lead.leadName}" needs immediate attention (score: ${lead.value})`,
          recommendation: lead.recommendation,
          createdAt: new Date().toISOString(),
          isResolved: false,
        });
      }
    }

    // Staff alerts
    for (const staff of staffResult.data?.coachingNeeded || []) {
      if (staff.value < 50) {
        alerts.push({
          id: `staff-${staff.staffId}`,
          alertType: 'performance_low',
          severity: 'warning',
          entityType: 'staff',
          entityId: staff.staffId,
          entityName: staff.staffName,
          message: `${staff.staffName} performance below threshold (score: ${staff.value})`,
          recommendation: staff.improvements[0] || 'Schedule coaching session',
          createdAt: new Date().toISOString(),
          isResolved: false,
        });
      }
    }

    // Business alerts
    if (businessResult.data && businessResult.data.score.value < 50) {
      alerts.push({
        id: 'business-health',
        alertType: 'business_health',
        severity: 'warning',
        entityType: 'business',
        message: `Business health score below threshold (${businessResult.data.score.value})`,
        recommendation: 'Review pipeline and team performance',
        createdAt: new Date().toISOString(),
        isResolved: false,
      });
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if ((leadResult.data?.needsAttention.length || 0) > 3) {
      recommendations.push('Multiple leads need attention - consider team capacity review');
    }
    if ((staffResult.data?.coachingNeeded.length || 0) > 0) {
      recommendations.push('Schedule coaching sessions for underperforming team members');
    }
    if ((businessResult.data?.score.leadFlow?.netChange ?? 0) < 0) {
      recommendations.push('Lead pipeline shrinking - increase lead generation efforts');
    }
    if (recommendations.length === 0) {
      recommendations.push('Overall performance is healthy - maintain current strategies');
    }

    const response: KPIDashboardResponse = {
      leadScores: leadResult.data!,
      staffScores: staffResult.data!,
      businessScore: businessResult.data!,
      alerts: alerts.slice(0, 10), // Limit to top 10 alerts
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: response,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Dashboard KPI error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error instanceof Error ? error.message : 'Dashboard KPI failed',
      },
    };
  }
}

export default {
  calculateLeadKPI,
  calculateStaffKPI,
  calculateBusinessKPI,
  getDashboardKPIs,
  KERNEL_CONFIG,
};
