/**
 * Note Route Handlers
 */

import * as db from '../services/supabase';
import * as embeddings from '../services/embeddings';
import * as contracts from '../contracts';
import type { CloudCoreResult, Note } from '../types';

/**
 * Get notes for a lead
 */
export async function getNotes(leadId: string): Promise<CloudCoreResult<Note[]>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(leadId);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid lead ID format',
      },
    };
  }

  return db.getNotes(leadId);
}

/**
 * Get a single note by ID
 */
export async function getNote(id: string): Promise<CloudCoreResult<Note | null>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid note ID format',
      },
    };
  }

  return db.getNote(id);
}

/**
 * Create a new note
 */
export async function createNote(
  data: contracts.CreateNoteRequest
): Promise<CloudCoreResult<Note>> {
  // Validate request
  const parsed = contracts.CreateNoteRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  const result = await db.createNote({
    lead_id: parsed.data.leadId,
    staff_id: parsed.data.staffId || null,
    text: parsed.data.text,
    date: parsed.data.date,
    audio_url: parsed.data.audioUrl,
  });

  // Generate embedding for the new note
  if (result.success && result.data) {
    // Fire and forget - don't block response
    embeddings.embedNote(result.data.id, result.data.text).catch((err) => {
      console.error('Failed to generate embedding for note:', err);
    });
  }

  return result;
}

/**
 * Update a note
 */
export async function updateNote(
  id: string,
  data: contracts.UpdateNoteRequest
): Promise<CloudCoreResult<Note>> {
  // Validate ID
  const idParsed = contracts.UUIDSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid note ID format',
      },
    };
  }

  // Validate request
  const parsed = contracts.UpdateNoteRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  const updates: Partial<Note> = {};
  if (parsed.data.text) updates.text = parsed.data.text;
  if (parsed.data.date) updates.date = parsed.data.date;
  if (parsed.data.transcriptionText) updates.transcription_text = parsed.data.transcriptionText;
  if (parsed.data.confidenceScore !== undefined) updates.confidence_score = parsed.data.confidenceScore;
  if (parsed.data.aiSummary) updates.ai_summary = parsed.data.aiSummary;

  const result = await db.updateNote(id, updates);

  // Re-generate embedding if text changed
  if (result.success && result.data && parsed.data.text) {
    embeddings.embedNote(id, parsed.data.text).catch((err) => {
      console.error('Failed to regenerate embedding for note:', err);
    });
  }

  return result;
}

/**
 * Delete a note
 */
export async function deleteNote(id: string): Promise<CloudCoreResult<void>> {
  // Validate ID
  const parsed = contracts.UUIDSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid note ID format',
      },
    };
  }

  return db.deleteNote(id);
}

export default {
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
};
