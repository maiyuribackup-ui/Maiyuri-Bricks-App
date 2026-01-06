
import { services, cloudcore } from '@maiyuri/api';

async function main() {
  const mockTranscript = `
    [Speaker 1] (Lead): Hello, I am looking for red bricks. What is the price?
    [Speaker 2] (Sales): The red bricks are 8 rupees each.
    [Speaker 1] (Lead): Do you have the new Gamma Bricks in stock?
    [Speaker 2] (Sales): I am not sure about Gamma Bricks. I don't know if we have them.
    [Speaker 1] (Lead): Okay, can you check?
    [Speaker 2] (Sales): Yes, I will check and let you know.
  `;

  const noteId = 'debug-note-id-' + Date.now();
  const leadId = 'debug-lead-id-' + Date.now();

  console.log('--- Starting Debug Analysis ---');
  
  // We mock the DB calls slightly or just rely on them failing/succeeding appropriately.
  // Actually, SalesCoach relies on `knowledgeCurator.searchKnowledge`.
  // If KB is empty, search result is empty -> "Missing".
  // If Sales says "I don't know" -> "Gap".
  
  // We will call the function directly and see logs (if we run with ts-node).
  // But wait, analyzeCall helper does not return anything.
  // I'll copy the logic here to debug it, OR I will modify analyzeCall to return the insights for testing.
  // Modifying analyzeCall is better for long term testability.
  
  try {
     const result = await cloudcore.kernels.salesCoach.analyzeCall(mockTranscript, noteId, leadId);
     console.log('Result:', result);
  } catch (e) {
     console.error('Error:', e);
  }
}

// Manually invoking the logic for clarity if needed:
// ...
