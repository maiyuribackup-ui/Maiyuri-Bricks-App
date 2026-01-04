import { NextRequest } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error } from '@/lib/api-utils';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// POST /api/transcribe - Transcribe audio file
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioUrl, noteId, mimeType = 'audio/mpeg' } = body;

    if (!audioUrl) {
      return error('Audio URL is required', 400);
    }

    // Fetch the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return error('Failed to fetch audio file', 400);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    // Use Gemini 2.5 Flash for transcription
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

    const audioPart: Part = {
      inlineData: {
        mimeType: mimeType,
        data: base64Audio,
      },
    };

    const result = await model.generateContent([
      audioPart,
      {
        text: `You are a highly accurate transcription assistant. Please transcribe the audio content accurately.

Instructions:
1. Transcribe ALL spoken words exactly as heard
2. Include punctuation and paragraph breaks where appropriate
3. If there are multiple speakers, try to distinguish them
4. Include any relevant non-speech sounds in [brackets] if they are important
5. If any words are unclear, mark them with [inaudible] or [unclear]
6. Preserve the original language (may be English, Tamil, or mixed)

Return ONLY the transcription text, nothing else. Do not include any explanations or metadata.`,
      },
    ]);

    const transcriptionText = result.response.text().trim();

    // Estimate confidence score
    const hasUnclearMarkers = /\[(inaudible|unclear)\]/i.test(transcriptionText);
    const confidenceScore = hasUnclearMarkers ? 0.75 : 0.95;

    // Detect language
    const tamilPattern = /[\u0B80-\u0BFF]/;
    const hasTamil = tamilPattern.test(transcriptionText);
    const language = hasTamil ? (transcriptionText.match(/[a-zA-Z]+/g)?.length || 0) > 5 ? 'mixed' : 'ta' : 'en';

    // If noteId provided, update the note with transcription
    if (noteId) {
      const { error: updateError } = await supabaseAdmin
        .from('notes')
        .update({
          transcription_text: transcriptionText,
          confidence_score: confidenceScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (updateError) {
        console.error('Failed to update note with transcription:', updateError);
        // Don't fail the request, just log the error
      }
    }

    return success({
      text: transcriptionText,
      confidence: confidenceScore,
      language,
      noteId: noteId || null,
    });
  } catch (err) {
    console.error('Transcription error:', err);
    return error('Failed to transcribe audio', 500);
  }
}

// POST /api/transcribe/summarize - Summarize transcription
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, noteId } = body;

    if (!text) {
      return error('Text is required for summarization', 400);
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

    const result = await model.generateContent([
      {
        text: `Summarize the following conversation/note in 2-3 concise bullet points. Focus on:
- Key topics discussed
- Any action items or decisions
- Important dates, numbers, or commitments mentioned

Text to summarize:
${text}

Return only the bullet points, nothing else.`,
      },
    ]);

    const summary = result.response.text().trim();

    // If noteId provided, update the note with AI summary
    if (noteId) {
      const { error: updateError } = await supabaseAdmin
        .from('notes')
        .update({
          ai_summary: summary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (updateError) {
        console.error('Failed to update note with summary:', updateError);
      }
    }

    return success({
      summary,
      noteId: noteId || null,
    });
  } catch (err) {
    console.error('Summarization error:', err);
    return error('Failed to summarize text', 500);
  }
}
