import { NextResponse } from 'next/server';
import { cloudcore } from '@maiyuri/api';

export async function POST() {
  const mockTranscript = `
    [Speaker 1] (Lead): Hello, I am looking for red bricks. What is the price?
    [Speaker 2] (Sales): The red bricks are 8 rupees each.
    [Speaker 1] (Lead): Do you have the new Gamma Bricks in stock?
    [Speaker 2] (Sales): I am not sure about Gamma Bricks. I don't know if we have them.
    [Speaker 1] (Lead): Okay, can you check?
    [Speaker 2] (Sales): Yes, I will check and let you know.
  `;

  // We need a valid noteId and leadId for the DB constraints.
  // We'll try to find an existing note or create a dummy one if possible, 
  // or just pass a UUID if the FK constraints allow (they don't usually).
  // Ideally we should use a real note. 
  // Let's create a dummy lead and note using cloudcore services.
  
  try {
     const { data: lead } = await cloudcore.services.supabase.createLead({
         name: 'Test Coach Lead',
         contact: '555-123-4567',
         source: 'test',
         lead_type: 'retail',
         assigned_staff: null,
         status: 'new'
     });

     if (!lead) return NextResponse.json({ error: 'Failed to create test lead' });

     const { data: note } = await cloudcore.services.supabase.createNote({
        lead_id: lead.id,
        text: 'Test Transcript Note', // Correct field name
        date: new Date().toISOString(),
        staff_id: null
     });
    
     if (!note) return NextResponse.json({ error: 'Failed to create test note' });

     const analysisResult = await cloudcore.kernels.salesCoach.analyzeCall(mockTranscript, note.id, lead.id);

     return NextResponse.json({ success: true, analysis: analysisResult });

  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
