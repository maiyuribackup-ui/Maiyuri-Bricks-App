/**
 * Transcription Route Handlers
 */

import * as transcriptionService from '../services/transcription';
import * as contracts from '../contracts';
import type { CloudCoreResult, TranscriptionResponse } from '../types';

/**
 * Transcribe audio
 */
export async function transcribe(
  data: contracts.TranscriptionRequest
): Promise<CloudCoreResult<TranscriptionResponse>> {
  // Validate request
  const parsed = contracts.TranscriptionRequestSchema.safeParse(data);
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

  return transcriptionService.transcribe({
    audioUrl: parsed.data.audioUrl,
    audioBase64: parsed.data.audioBase64,
    mimeType: parsed.data.mimeType,
    language: parsed.data.language,
    summarize: parsed.data.summarize,
  });
}

/**
 * Transcribe audio and save to a note
 */
export async function transcribeAndSave(
  noteId: string,
  audioUrl: string,
  options?: {
    mimeType?: string;
    language?: 'en' | 'ta' | 'auto';
    summarize?: boolean;
    generateEmbedding?: boolean;
  }
): Promise<CloudCoreResult<TranscriptionResponse>> {
  // Validate note ID
  const parsed = contracts.UUIDSchema.safeParse(noteId);
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

  return transcriptionService.transcribeAndSaveToNote(noteId, audioUrl, options);
}

/**
 * Upload audio file
 */
export async function uploadAudio(
  file: Buffer | Blob,
  filename: string,
  contentType?: string
): Promise<CloudCoreResult<{ path: string; url: string }>> {
  return transcriptionService.uploadAudio(file, filename, contentType);
}

/**
 * Get signed URL for audio file
 */
export async function getAudioUrl(
  path: string,
  expiresIn?: number
): Promise<CloudCoreResult<string>> {
  return transcriptionService.getAudioSignedUrl(path, expiresIn);
}

export default {
  transcribe,
  transcribeAndSave,
  uploadAudio,
  getAudioUrl,
};
