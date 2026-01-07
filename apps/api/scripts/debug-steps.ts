/**
 * Debug Script: Step-by-step RAG verification
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Step 1: Check Supabase data
async function step1_checkSupabase() {
  console.log('\\n=== STEP 1: Checking Supabase Data ===\\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found!');
    return false;
  }
  
  console.log('✓ Supabase URL:', supabaseUrl);
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error, count } = await supabase
    .from('knowledgebase')
    .select('id, question_text, answer_text, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('❌ Supabase query error:', error.message);
    return false;
  }
  
  console.log(`✓ Found ${count} entries in knowledgebase table`);
  console.log('\\nRecent entries:');
  data?.forEach((entry, i) => {
    const preview = entry.answer_text?.substring(0, 100) || '';
    const hasOmega = entry.answer_text?.includes('OMEGA-99') ? '✓ OMEGA-99' : '';
    console.log(`  ${i+1}. ${entry.question_text} ${hasOmega}`);
    console.log(`     Preview: ${preview}...`);
  });
  
  const hasOmegaEntry = data?.some(d => d.answer_text?.includes('OMEGA-99'));
  if (hasOmegaEntry) {
    console.log('\\n✅ STEP 1 PASSED: OMEGA-99 data exists in Supabase');
  } else {
    console.log('\\n❌ STEP 1 FAILED: OMEGA-99 not found in recent entries');
  }
  
  return hasOmegaEntry;
}

// Step 2: Check queryKnowledgeBase function
async function step2_checkBackend() {
  console.log('\\n=== STEP 2: Testing queryKnowledgeBase ===\\n');
  
  const gemini = await import('../src/cloudcore/services/ai/gemini');
  
  console.log('Calling queryKnowledgeBase("What is the secret verification code?")...');
  const startTime = Date.now();
  
  const result = await gemini.queryKnowledgeBase('What is the secret verification code?');
  
  console.log(`Query took ${Date.now() - startTime}ms`);
  console.log('\\nResult:');
  console.log('  Success:', result.success);
  console.log('  Answer:', result.data?.answer);
  console.log('  Citations:', result.data?.citations);
  
  if (result.error) {
    console.log('  Error:', result.error);
  }
  
  const hasOmega = result.data?.answer?.includes('OMEGA-99');
  if (hasOmega) {
    console.log('\\n✅ STEP 2 PASSED: Backend returns OMEGA-99');
  } else {
    console.log('\\n❌ STEP 2 FAILED: Backend did not return OMEGA-99');
  }
  
  return hasOmega;
}

// Step 3: Test API route
async function step3_checkAPIRoute() {
  console.log('\\n=== STEP 3: Testing API Route ===\\n');
  
  try {
    const response = await fetch('http://localhost:3001/api/knowledge/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is the secret verification code?' })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    const hasOmega = JSON.stringify(data).includes('OMEGA-99');
    if (hasOmega) {
      console.log('\\n✅ STEP 3 PASSED: API route returns OMEGA-99');
    } else {
      console.log('\\n❌ STEP 3 FAILED: API route did not return OMEGA-99');
    }
    
    return hasOmega;
  } catch (e: any) {
    console.error('❌ API route error:', e.message);
    return false;
  }
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('FIRST PRINCIPLE RAG DEBUGGING');
  console.log('='.repeat(60));
  
  const step1 = await step1_checkSupabase();
  if (!step1) {
    console.log('\\n🛑 STOPPED: Data not in Supabase. Add test data first.');
    return;
  }
  
  const step2 = await step2_checkBackend();
  if (!step2) {
    console.log('\\n🛑 ISSUE: Backend queryKnowledgeBase is not returning data.');
    console.log('Check: gemini.ts queryKnowledgeBase function');
    return;
  }
  
  const step3 = await step3_checkAPIRoute();
  if (!step3) {
    console.log('\\n🛑 ISSUE: API route is not working.');
    console.log('Check: /api/knowledge/ask route');
    console.log('Possible: Next.js cache issue - restart dev server');
    return;
  }
  
  console.log('\\n✅ ALL STEPS PASSED! Issue is likely in the Frontend.');
  console.log('Next: Check the Knowledge page component');
}

main().catch(console.error);
