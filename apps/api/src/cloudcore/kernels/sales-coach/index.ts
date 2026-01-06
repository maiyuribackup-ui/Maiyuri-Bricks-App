/**
 * Sales Coach Kernel
 * Analyzes transcripts for coaching insights and knowledge gaps.
 */

import * as services from '../../services';
import * as knowledgeCurator from '../knowledge-curator'; // Importing sibling kernel

export async function analyzeCall(transcript: string, noteId: string, leadId: string): Promise<any> {
  console.log(`[SalesCoach] Analyzing call for Note ID: ${noteId}`);
  
  try {
    // 1. Extract Q&A Pairs from Transcript using Gemini
    // Using completeJson for robust parsing
    const parseResult = await services.ai.gemini.completeJson<any[]>({
      systemPrompt: 'You are an expert sales analyst.',
      userPrompt: `Analyze this sales call transcript and extract all Question-Answer pairs where the LEAD asks a question and the SALESPERSON responds.
      
      Transcript:
      ${transcript}
      
      Return JSON Array:
      [
        {
          "question": "Lead's exact question",
          "answer": "Salesperson's response (summary or direct quote)",
          "context": "Surrounding context if needed"
        }
      ]`
    });

    if (!parseResult.success || !parseResult.data) {
        console.error('[SalesCoach] Failed to parse transcript Q&A');
        return { success: false, error: 'Failed to parse transcript Q&A', details: parseResult.error };
    }

    const qaPairs = parseResult.data;
    console.log(`[SalesCoach] Extracted ${qaPairs.length} Q&A pairs.`);

    const results: any[] = [];

    for (const pair of qaPairs) {
        // ... (existing loop logic) ...
        const searchResult = await knowledgeCurator.searchKnowledge(pair.question, { limit: 3 });
        const kbSources = searchResult.success && searchResult.data ? searchResult.data : [];
        
        const topMatch = kbSources[0];
        const hasKBMatch = topMatch && topMatch.score > 0.75; 

        // 3. Evaluate Connection
        const evaluationPrompt = `
        Role: Sales Quality Auditor.
        Task: Evaluate the salesperson's response compared to the Knowledge Base (KB).
        
        Lead Question: "${pair.question}"
        Salesperson Answer: "${pair.answer}"
        KB Best Match (${hasKBMatch ? 'Exists' : 'Missing'}): "${hasKBMatch ? topMatch.content : 'N/A'}"
        
        Determine:
        1. Is the Salesperson's answer WRONG or WEAK compared to KB? (If KB exists) -> IMP TYPE: 'coaching'
        2. Is the Salesperson's answer "I don't know" or vague AND KB is Missing? -> IMP TYPE: 'gap'
        3. Is it good? -> IMP TYPE: 'ok'
        
        Return JSON object with keys: type, reason, suggestion, correction.
        `;

        const evalResult = await services.ai.gemini.completeJson<any>({
            systemPrompt: 'You are a Sales Quality Auditor.',
            userPrompt: evaluationPrompt
        });

        if (!evalResult.success || !evalResult.data) continue;
        
        const evaluation = evalResult.data;
        results.push({ pair, evaluation });

        if (evaluation.type === 'coaching') {
            console.log(`[SalesCoach] Coaching Insight: ${evaluation.reason}`);
            await services.supabase.supabase.from('coaching_insights').insert({
                note_id: noteId,
                lead_id: leadId,
                insight_type: 'correction',
                quote_text: pair.answer,
                suggestion: evaluation.suggestion || evaluation.correction,
            });
        } else if (evaluation.type === 'gap') {
            console.log(`[SalesCoach] Knowledge Gap: ${pair.question}`);
            
            const { data: qData, error: qError } = await services.supabase.supabase.from('unanswered_questions').insert({
                question_text: pair.question,
                context: pair.context,
                source_note_id: noteId,
                status: 'task_created' 
            }).select().single();

            if (qError) {
                console.error('[SalesCoach] Error creating unanswered question:', qError);
                continue;
            }

            if (qData) {
                const taskRes = await services.tasks.createTask({
                    title: `Update KB: ${pair.question.substring(0, 50)}...`,
                    description: `Missing info detected in sales call (Note ${noteId}).\nQuestion: ${pair.question}\nContext: ${pair.context}`,
                    priority: 'medium',
                    dueDate: new Date(Date.now() + 86400000 * 2).toISOString(), 
                });
                console.log('[SalesCoach] Task created:', taskRes);
                
                // Add to results for debugging
                (evaluation as any).taskResult = taskRes;

                await services.telegram.notifyNewQuestion(pair.question, pair.context);
            }
        }
    }
    
    return { success: true, qaPairs, results };

  } catch (error) {
    console.error('[SalesCoach] Error analyzing call:', error);
  }
}

export default {
    analyzeCall
};
