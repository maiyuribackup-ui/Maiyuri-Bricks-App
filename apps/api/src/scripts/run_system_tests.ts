
import { analyze } from '../cloudcore/kernels/lead-analyst';
import { ingest, answerQuestion } from '../cloudcore/kernels/knowledge-curator';
import { supabase } from '../cloudcore/services/supabase';

const POSITIVE_TRANSCRIPT = `
Customer: Ungal interlock bricks load-bearing ah?
Sales: Yes sir, it is load-bearing, we use CSEB with 7-8 MPa strength.
Customer: Square feet rate evlo?
Sales: ₹38 per brick, installation separate.
Customer: Site visit arrange pannalama?
Sales: Definitely sir, tomorrow itself arrange pannalaam.
Customer: Okay, please WhatsApp quotation.
`;

const NEGATIVE_TRANSCRIPT = `
Customer: Just enquiry dhaan, future-la paakalaam.
Sales: Okay sir, price discuss pannalama?
Customer: Not now, later call pannunga.
`;

async function runSystemTests() {
  console.log('🧪 Starting System Tests based on Testscenarios.md\n');
  const testIds: { leads: string[], notes: string[], kb: string[] } = { leads: [], notes: [], kb: [] };

  try {
    // ==========================================
    // SCENARIO 1: Positive Call (Lead Scoring)
    // ==========================================
    console.log('▶️  Test Scenario 1: Positive Call (High Score)');
    
    // 1. Setup Lead
    const { data: leadA, error: errA } = await supabase.from('leads').insert({
      name: 'Test Lead Positive',
      contact: 'test@example.com',
      status: 'new',
      lead_type: 'customer',
      source: 'test_script'
    }).select().single();
    if (errA) throw errA;
    testIds.leads.push(leadA.id);

    // 2. Add Note with Transcript
    const { data: noteA, error: errNoteA } = await supabase.from('notes').insert({
      lead_id: leadA.id,
      text: 'Sales Call - Positive',
      transcription_text: POSITIVE_TRANSCRIPT,
      date: new Date().toISOString()
    }).select().single();
    if (errNoteA) throw errNoteA;
    testIds.notes.push(noteA.id);

    // 3. Analyze
    console.log('   Analyzing lead...');
    const resultA = await analyze({ leadId: leadA.id, analysisType: 'full_analysis' });
    
    // 4. Verification
    if (resultA.success && resultA.data) {
        const score = resultA.data.score?.value || 0;
        console.log(`   Score: ${score} (Expected > 0.7)`);
        console.log(`   Summary: ${resultA.data.summary?.text.slice(0, 50)}...`);
        
        if (score > 0.7) console.log('   ✅ PASS');
        else console.log('   ❌ FAIL: Score too low');
    } else {
        console.error('   ❌ FAIL: Analysis failed', resultA.error);
    }

    // ==========================================
    // SCENARIO 2: Negative Call (Lead Scoring)
    // ==========================================
    console.log('\n▶️  Test Scenario 2: Negative Call (Low Score)');

    // 1. Setup Lead
    const { data: leadB, error: errB } = await supabase.from('leads').insert({
      name: 'Test Lead Negative',
      contact: 'negative@example.com',
      status: 'new',
      lead_type: 'customer',
      source: 'test_script'
    }).select().single();
    if (errB) throw errB;
    testIds.leads.push(leadB.id);

    // 2. Add Note
    const { data: noteB, error: errNoteB } = await supabase.from('notes').insert({
        lead_id: leadB.id,
        text: 'Sales Call - Negative',
        transcription_text: NEGATIVE_TRANSCRIPT,
        date: new Date().toISOString()
    }).select().single();
    if (errNoteB) throw errNoteB;
    testIds.notes.push(noteB.id);

    // 3. Analyze
    console.log('   Analyzing lead...');
    const resultB = await analyze({ leadId: leadB.id, analysisType: 'full_analysis' });

    // 4. Verification
    if (resultB.success && resultB.data) {
        const score = resultB.data.score?.value || 0;
        console.log(`   Score: ${score} (Expected < 0.5)`); // Adjusted threshold based on status weights
        
        if (score < 0.5) console.log('   ✅ PASS');
        else console.log('   ❌ FAIL: Score too high');
    } else {
        console.error('   ❌ FAIL: Analysis failed', resultB.error);
    }

    // ==========================================
    // SCENARIO 4 & 5: RAG Loop
    // ==========================================
    console.log('\n▶️  Test Scenario 4 & 5: RAG Knowledge Loop');
    
    // 1. Ingest Knowledge
    console.log('   Ingesting "Rain Durability" answer...');
    const ingestRes = await ingest({
        content: "CSEB bricks are fully water-resistant when stabilized with 8% cement. They are tested per IS 1725 for rain durability.",
        title: "CSEB Rain Durability",
        category: "Technical",
        contentType: "manual"
    });
    
    if (ingestRes.success && ingestRes.data) {
        testIds.kb.push(...ingestRes.data.map(k => k.id));
    } else {
        throw new Error('Ingestion failed');
    }

    // 2. Query
    await new Promise(r => setTimeout(r, 2000)); // Wait for generic indexing
    const query = "Earth bricks rain-la weaken aaguma?"; // "Will earth bricks weaken in rain?"
    console.log(`   Asking: "${query}"`);
    
    const answerRes = await answerQuestion(query);

    if (answerRes.success && answerRes.data) {
        console.log(`   Answer: ${answerRes.data.answer}`);
        console.log(`   Confidence: ${answerRes.data.confidence}`);
        
        const ans = answerRes.data.answer.toLowerCase();
        if (ans.includes('water-resistant') || ans.includes('tested') || ans.includes('weathering') || ans.includes('resistance')) {
             console.log('   ✅ PASS: Correct RAG answer');
        } else {
             console.log('   ❌ FAIL: Answer unclear');
        }
    } else {
        console.error('   ❌ FAIL: QA failed', answerRes.error);
    }

  } catch (err) {
    console.error('⚠️ Critical Test Failure:', err);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    if (testIds.notes.length) await supabase.from('notes').delete().in('id', testIds.notes);
    if (testIds.leads.length) await supabase.from('leads').delete().in('id', testIds.leads);
    if (testIds.kb.length) await supabase.from('knowledgebase').delete().in('id', testIds.kb);
    console.log('Done.');
  }
}

runSystemTests();
