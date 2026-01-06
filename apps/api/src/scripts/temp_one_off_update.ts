
import { supabase } from '../cloudcore/services/supabase';
import * as claude from '../cloudcore/services/ai/claude';
import type { Lead } from '../cloudcore/types';

async function main() {
  console.log('Starting one-off update based on staff_notes...');

  // 1. Fetch leads with staff_notes
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .not('staff_notes', 'is', null)
    .neq('staff_notes', '');

  if (error) {
    console.error('Error fetching leads:', error);
    process.exit(1);
  }

  console.log(`Found ${leads.length} leads with staff_notes.`);

  // Process in batches of 2 to avoid rate limits
  const BATCH_SIZE = 2;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    if (i > 0) {
      console.log('  Waiting 1s between batches...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const batch = leads.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(leads.length / BATCH_SIZE)}`);

    await Promise.all(batch.map(async (lead) => {
      console.log(`  Processing lead: ${lead.name} (${lead.id})`);

      try {
        // Prepare context
        const leadContext = formatLeadContext(lead);
        const notesContext = `Staff Notes: ${lead.staff_notes}`;

        // Generate all AI insights in parallel
        const [summaryResult, scoreResult, suggestionsResult] = await Promise.all([
          // Summary
          claude.completeJson<{
            summary: string;
            highlights: string[];
            actionItems: string[];
            keyDates?: string[];
            sentiment?: string;
          }>({
            systemPrompt: `You are a sales assistant summarizing lead interactions for a brick manufacturing business.
Create a concise summary based on the staff notes.`,
            userPrompt: `Summarize this lead:
LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "summary": "Concise summary",
  "highlights": ["Key point 1", "Key point 2"],
  "actionItems": ["Action 1", "Action 2"],
  "keyDates": ["Important date 1"],
  "sentiment": "positive|neutral|negative"
}`,
            maxTokens: 1024,
            temperature: 0.5,
            model: 'HAIKU',
          }),

          // Score (using local Haiku implementation)
          (async () => {
             const daysSinceCreated = Math.floor(
                (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              // Simple metrics
              const metricsStr = `- daysSinceCreated: ${daysSinceCreated}\n- notesCount: 1`;
              
              return claude.completeJson<{
                score: number;
                confidence: number;
                factors: Array<{ factor: string; impact: string; weight: number }>;
                recommendation: string;
              }>({
                systemPrompt: `You are a lead scoring expert for a brick manufacturing business.
Calculate conversion probability based on lead data and interaction history.

Scoring Factors:
- Engagement level
- Expressed urgency/timeline
- Budget indicators
- Decision-maker status
- Project specifics
- Response timeliness
- Sentiment`,
                userPrompt: `Score this lead's conversion probability:

LEAD INFORMATION:
${leadContext}

METRICS:
${metricsStr}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "score": 0.75,
  "confidence": 0.85,
  "factors": [
    {"factor": "Description", "impact": "positive|negative|neutral", "weight": 0.2}
  ],
  "recommendation": "Specific recommendation"
}`,
                maxTokens: 1024,
                temperature: 0.3,
                model: 'HAIKU',
              });
          })(),

          // Suggestions (using local Haiku implementation)
          claude.completeJson<{
            suggestions: Array<{
              id: string;
              type: string;
              content: string;
              priority: string;
              reasoning: string;
            }>;
            nextBestAction: string;
            suggestedFollowUpDate: string;
          }>({
            systemPrompt: `You are a sales advisor for a brick manufacturing business.
Generate actionable suggestions to help close leads.

Suggestion Types:
- action: Tasks to complete
- response: What to say to the lead
- insight: Observations about the lead
- warning: Potential issues to address`,
            userPrompt: `Generate suggestions for this lead:

LEAD INFORMATION:
${leadContext}

INTERACTION HISTORY:
${notesContext}

Respond with JSON:
{
  "suggestions": [
    {
      "id": "uuid",
      "type": "action|response|insight|warning",
      "content": "Suggestion text",
      "priority": "high|medium|low",
      "reasoning": "Why this suggestion"
    }
  ],
  "nextBestAction": "Single most important action",
  "suggestedFollowUpDate": "YYYY-MM-DD"
}`,
            maxTokens: 1024,
            temperature: 0.7,
            model: 'HAIKU',
          })
        ]);

        // Update Lead
        const updates: any = {};
        
        if (summaryResult.success && summaryResult.data) {
          updates.ai_summary = summaryResult.data.summary;
        }
        
        if (scoreResult.success && scoreResult.data) {
          updates.ai_score = scoreResult.data.score;
          updates.ai_factors = scoreResult.data.factors;
        }

        if (suggestionsResult.success && suggestionsResult.data) {
          updates.ai_suggestions = suggestionsResult.data.suggestions.map((s) => ({
            type: s.type,
            content: s.content,
            priority: s.priority,
          }));
          updates.next_action = suggestionsResult.data.nextBestAction;
          updates.follow_up_date = suggestionsResult.data.suggestedFollowUpDate;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('leads')
            .update(updates)
            .eq('id', lead.id);

          if (updateError) {
            console.error(`    Error updating lead ${lead.id}:`, updateError);
          } else {
            console.log(`    Successfully updated lead ${lead.id}`);
          }
        } else {
          console.log(`    No updates generated for lead ${lead.id}`);
        }

      } catch (err) {
        console.error(`    Failed to process lead ${lead.id}:`, err);
      }
    }));
  }

  console.log('Batch update completed.');
}

function formatLeadContext(lead: Lead): string {
  return `Name: ${lead.name}
Contact: ${lead.contact}
Source: ${lead.source}
Type: ${lead.lead_type}
Status: ${lead.status}
Created: ${lead.created_at}`;
}

main().catch(console.error);
