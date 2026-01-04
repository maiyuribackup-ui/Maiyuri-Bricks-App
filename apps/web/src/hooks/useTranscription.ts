'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  noteId?: string | null;
}

interface SummarizationResult {
  summary: string;
  noteId?: string | null;
}

interface TranscribeParams {
  audioUrl: string;
  noteId?: string;
  mimeType?: string;
}

interface SummarizeParams {
  text: string;
  noteId?: string;
}

/**
 * Hook for transcribing audio files using Gemini AI
 */
export function useTranscribe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TranscribeParams): Promise<TranscriptionResult> => {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioUrl: params.audioUrl,
          noteId: params.noteId,
          mimeType: params.mimeType || 'audio/webm',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
      }

      const { data } = await response.json();
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate notes query if a noteId was provided
      if (variables.noteId) {
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        queryClient.invalidateQueries({
          queryKey: ['note', variables.noteId],
        });
      }
    },
  });
}

/**
 * Hook for summarizing text using Gemini AI
 */
export function useSummarize() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SummarizeParams): Promise<SummarizationResult> => {
      const response = await fetch('/api/transcribe', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: params.text,
          noteId: params.noteId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Summarization failed');
      }

      const { data } = await response.json();
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate notes query if a noteId was provided
      if (variables.noteId) {
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        queryClient.invalidateQueries({
          queryKey: ['note', variables.noteId],
        });
      }
    },
  });
}

/**
 * Hook for uploading audio files
 */
export function useUploadAudio() {
  return useMutation({
    mutationFn: async ({
      file,
      leadId,
    }: {
      file: File | Blob;
      leadId?: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (leadId) {
        formData.append('leadId', leadId);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const { data } = await response.json();
      return data;
    },
  });
}

/**
 * Hook for deleting uploaded audio files
 */
export function useDeleteAudio() {
  return useMutation({
    mutationFn: async (path: string) => {
      const response = await fetch(`/api/upload?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      const { data } = await response.json();
      return data;
    },
  });
}

export default {
  useTranscribe,
  useSummarize,
  useUploadAudio,
  useDeleteAudio,
};
