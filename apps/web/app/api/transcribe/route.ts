import { NextRequest } from 'next/server';
import { services } from '@maiyuri/api';
import { success, error } from '@/lib/api-utils';

// POST /api/transcribe - Transcribe audio file using CloudCore
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioUrl, audioBase64, noteId, mimeType = 'audio/mpeg', language = 'auto' } = body;

    if (!audioUrl && !audioBase64) {
      return error('Either audioUrl or audioBase64 is required', 400);
    }

    // Use CloudCore's transcription service
    const result = await services.transcription.transcribe({
      audioUrl,
      audioBase64,
      mimeType,
      language,
      summarize: false,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Transcription failed', 500);
    }

    // If noteId provided, save to note using CloudCore (snake_case for database)
    if (noteId) {
      await services.supabase.updateNote(noteId, {
        transcription_text: result.data.text,
        confidence_score: result.data.confidence,
      });
    }

    return success({
      text: result.data.text,
      confidence: result.data.confidence,
      language: result.data.language,
      duration: result.data.duration,
      noteId: noteId || null,
    });
  } catch (err) {
    console.error('Transcription error:', err);
    return error('Failed to transcribe audio', 500);
  }
}

// PUT /api/transcribe - Summarize transcription using CloudCore
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, noteId } = body;

    if (!text) {
      return error('Text is required for summarization', 400);
    }

    // Use CloudCore's Gemini service for summarization
    const result = await services.ai.gemini.summarizeTranscription(text);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Summarization failed', 500);
    }

    // If noteId provided, update the note with AI summary (snake_case for database)
    if (noteId) {
      await services.supabase.updateNote(noteId, {
        ai_summary: result.data.summary,
      });
    }

    return success({
      summary: result.data.summary,
      highlights: result.data.highlights,
      noteId: noteId || null,
    });
  } catch (err) {
    console.error('Summarization error:', err);
    return error('Failed to summarize text', 500);
  }
}
