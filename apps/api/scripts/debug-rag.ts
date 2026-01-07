/**
 * Debug RAG Store - Check what's in the File Search Store
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function debugStore() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  
  console.log('=== Listing File Search Stores ===\n');
  
  const stores = await client.fileSearchStores.list();
  for await (const store of stores) {
    console.log('Store:', JSON.stringify(store, null, 2));
    
    // Try to list documents in this store
    console.log('\n--- Documents in store ---');
    try {
      const docs = await client.fileSearchStores.listDocuments({ fileSearchStoreName: store.name });
      for await (const doc of docs) {
        console.log('Document:', JSON.stringify(doc, null, 2));
      }
    } catch (e: any) {
      console.log('Could not list documents:', e.message);
    }
  }
  
  console.log('\n=== Testing generateContent with File Search ===\n');
  
  // Get the store name
  let storeName = '';
  const storeList = await client.fileSearchStores.list();
  for await (const s of storeList) {
    if (s.config?.displayName?.includes('Maiyuri') || s.displayName?.includes('Maiyuri')) {
      storeName = s.name || '';
      break;
    }
  }
  
  if (!storeName) {
    console.log('No Maiyuri store found!');
    return;
  }
  
  console.log('Using store:', storeName);
  
  // Try query with verbose output
  try {
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        tools: [{
          fileSearch: {
            fileSearchStoreNames: [storeName]
          }
        }]
      },
      contents: [{ role: 'user', parts: [{ text: 'What is the secret verification code? Look for OMEGA-99.' }] }]
    });
    
    console.log('\nFull response:');
    console.log('Text:', result.text);
    console.log('\nCandidates:', JSON.stringify(result.candidates, null, 2));
  } catch (e: any) {
    console.error('Query error:', e.message);
    console.error('Full error:', e);
  }
}

debugStore().catch(console.error);
