/**
 * Test RAG System - End-to-End
 * Run with: npx ts-node scripts/test-rag.ts
 */

import 'dotenv/config';
import * as gemini from '../src/cloudcore/services/ai/gemini';

async function testRAG() {
  console.log('=== RAG System Test ===\n');

  // Step 1: Add test content
  console.log('1. Adding test content to Knowledge Base...');
  const addResult = await gemini.addToKnowledgeBase(
    'Secret Verification Code',
    'The secret verification code for the Maiyuri Bricks system is OMEGA-99. This code is used for testing the RAG system.',
    { category: 'test', source: 'test-script' }
  );

  if (!addResult.success) {
    console.error('❌ Failed to add content:', addResult.error);
    return;
  }
  console.log('✅ Content added:', addResult.data);

  // Wait for indexing
  console.log('\n2. Waiting 5s for indexing...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 2: Query the knowledge base
  console.log('\n3. Querying Knowledge Base...');
  const queryResult = await gemini.queryKnowledgeBase('What is the secret verification code?');

  if (!queryResult.success) {
    console.error('❌ Query failed:', queryResult.error);
    return;
  }

  console.log('\n=== Query Result ===');
  console.log('Answer:', queryResult.data?.answer);
  console.log('Citations:', queryResult.data?.citations);

  // Verify
  if (queryResult.data?.answer?.includes('OMEGA-99')) {
    console.log('\n✅ SUCCESS: RAG system correctly retrieved OMEGA-99!');
  } else {
    console.log('\n⚠️  Note: OMEGA-99 not found in answer. This could mean:');
    console.log('   - Content is still indexing (wait and try again)');
    console.log('   - Model did not ground on the uploaded content');
  }
}

testRAG().catch(console.error);
