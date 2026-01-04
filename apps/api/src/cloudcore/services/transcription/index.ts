/**
 * Transcription Service
 * Audio transcription using Gemini with Tamil-first support
 */

import * as gemini from '../ai/gemini';
import * as embeddings from '../embeddings';
import { supabase, updateNote } from '../supabase';
import type {
  CloudCoreResult,
  TranscriptionRequest,
  TranscriptionResponse,
} from '../../types';

/**
 * Transcribe audio from URL or base64
 */
export async function transcribe(
  request: TranscriptionRequest
): Promise<CloudCoreResult<TranscriptionResponse>> {
  const startTime = Date.now();

  try {
    // Determine transcription method
    let transcriptionResult;
    if (request.audioBase64) {
      transcriptionResult = await gemini.transcribeAudioFromBase64(
        request.audioBase64,
        request.mimeType || 'audio/mpeg',
        { language: request.language }
      );
    } else if (request.audioUrl) {
      transcriptionResult = await gemini.transcribeAudio(
        request.audioUrl,
        request.mimeType || 'audio/mpeg',
        { language: request.language }
      );
    } else {
      return {
        success: false,
        data: null,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Either audioUrl or audioBase64 is required',
        },
      };
    }

    if (!transcriptionResult.success || !transcriptionResult.data) {
      return {
        success: false,
        data: null,
        error: transcriptionResult.error,
      };
    }

    const response: TranscriptionResponse = {
      text: transcriptionResult.data.text,
      confidence: transcriptionResult.data.confidence,
      language: transcriptionResult.data.language,
      duration: transcriptionResult.data.duration,
    };

    // Optionally summarize
    if (request.summarize) {
      const summaryResult = await gemini.summarizeTranscription(
        transcriptionResult.data.text
      );

      if (summaryResult.success && summaryResult.data) {
        response.summary = summaryResult.data.summary;
        response.highlights = summaryResult.data.highlights;
      }
    }

    return {
      success: true,
      data: response,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'TRANSCRIPTION_ERROR',
        message: error instanceof Error ? error.message : 'Transcription failed',
      },
    };
  }
}

/**
 * Transcribe audio and save to a note
 */
export async function transcribeAndSaveToNote(
  noteId: string,
  audioUrl: string,
  options?: {
    mimeType?: string;
    language?: 'en' | 'ta' | 'auto';
    summarize?: boolean;
    generateEmbedding?: boolean;
  }
): Promise<CloudCoreResult<TranscriptionResponse>> {
  const startTime = Date.now();

  try {
    // Transcribe
    const result = await transcribe({
      audioUrl,
      mimeType: options?.mimeType,
      language: options?.language,
      summarize: options?.summarize,
    });

    if (!result.success || !result.data) {
      return result;
    }

    // Update note with transcription
    const updateResult = await updateNote(noteId, {
      transcription_text: result.data.text,
      confidence_score: result.data.confidence,
      ai_summary: result.data.summary,
    });

    if (!updateResult.success) {
      console.error('Failed to update note with transcription:', updateResult.error);
    }

    // Generate embedding if requested
    if (options?.generateEmbedding && result.data.text) {
      const embedResult = await embeddings.embedNote(noteId, result.data.text);
      if (!embedResult.success) {
        console.error('Failed to generate embedding for note:', embedResult.error);
      }
    }

    return {
      success: true,
      data: result.data,
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Transcribe and save error:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'TRANSCRIBE_SAVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to transcribe and save',
      },
    };
  }
}

/**
 * Get signed URL for audio file in Supabase storage
 */
export async function getAudioSignedUrl(
  path: string,
  expiresIn: number = 3600
): Promise<CloudCoreResult<string>> {
  try {
    const { data, error } = await supabase.storage
      .from('audio')
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data.signedUrl,
    };
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'SIGNED_URL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get signed URL',
      },
    };
  }
}

/**
 * Upload audio file to Supabase storage
 */
export async function uploadAudio(
  file: Buffer | Blob,
  filename: string,
  contentType: string = 'audio/mpeg'
): Promise<CloudCoreResult<{ path: string; url: string }>> {
  const startTime = Date.now();

  try {
    const path = `uploads/${Date.now()}-${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(path, file, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from('audio')
      .createSignedUrl(path, 3600);

    if (urlError) {
      throw urlError;
    }

    return {
      success: true,
      data: {
        path,
        url: urlData.signedUrl,
      },
      meta: { processingTime: Date.now() - startTime },
    };
  } catch (error) {
    console.error('Error uploading audio:', error);
    return {
      success: false,
      data: null,
      error: {
        code: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload audio',
      },
    };
  }
}

export default {
  transcribe,
  transcribeAndSaveToNote,
  getAudioSignedUrl,
  uploadAudio,
};
