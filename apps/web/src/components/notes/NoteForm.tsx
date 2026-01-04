'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Spinner, Input, Textarea } from '@maiyuri/ui';
import { AudioUploader } from './AudioUploader';
import { TranscriptionStatus } from './TranscriptionStatus';

// Complete form schema with all fields
const noteFormSchema = z.object({
  lead_id: z.string().uuid('Invalid lead ID'),
  staff_id: z.string().uuid().optional(),
  text: z.string().min(1, 'Note text is required'),
  date: z.string().min(1, 'Date is required'),
  audio_url: z.string().url().optional(),
  transcription_text: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
});

type NoteFormData = z.infer<typeof noteFormSchema>;

interface NoteFormProps {
  leadId: string;
  staffId?: string;
  onSuccess?: (note: NoteFormData & { id: string }) => void;
  onCancel?: () => void;
}

export function NoteForm({
  leadId,
  staffId,
  onSuccess,
  onCancel,
}: NoteFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioData, setAudioData] = useState<{
    path: string;
    url: string;
    mimeType: string;
  } | null>(null);
  const [transcription, setTranscription] = useState<{
    text: string;
    confidence: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NoteFormData>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      lead_id: leadId,
      staff_id: staffId || undefined,
      text: '',
      date: new Date().toISOString().split('T')[0],
    },
  });

  const textValue = watch('text');

  const handleAudioUpload = useCallback(
    (data: { path: string; url: string; mimeType: string }) => {
      setAudioData(data);
      setValue('audio_url', data.url);
    },
    [setValue]
  );

  const handleTranscription = useCallback(
    (result: { text: string; confidence: number }) => {
      setTranscription(result);
      setValue('transcription_text', result.text);
      setValue('confidence_score', result.confidence);

      // If no manual text was entered, use transcription as the note text
      if (!textValue) {
        setValue('text', result.text);
      }
    },
    [setValue, textValue]
  );

  const onSubmit = async (data: NoteFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          audio_url: audioData?.url,
          transcription_text: transcription?.text,
          confidence_score: transcription?.confidence,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create note');
      }

      const { data: note } = await response.json();
      onSuccess?.(note);
    } catch (err) {
      console.error('Error creating note:', err);
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Date Field */}
      <div>
        <label
          htmlFor="date"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Date
        </label>
        <Input
          id="date"
          type="date"
          {...register('date')}
          error={errors.date?.message}
        />
      </div>

      {/* Audio Recording/Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Voice Note (Optional)
        </label>
        <AudioUploader
          leadId={leadId}
          onUploadComplete={handleAudioUpload}
          onError={(err) => setError(err)}
          disabled={isSubmitting}
        />
      </div>

      {/* Transcription (if audio uploaded) */}
      {audioData && !transcription && (
        <TranscriptionStatus
          audioUrl={audioData.url}
          mimeType={audioData.mimeType}
          onTranscriptionComplete={handleTranscription}
          onError={(err) => console.error('Transcription error:', err)}
        />
      )}

      {/* Transcription Preview */}
      {transcription && (
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">
              Transcription
            </span>
            <span className="text-xs text-blue-600">
              {Math.round(transcription.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm text-blue-900">{transcription.text}</p>
        </div>
      )}

      {/* Note Text */}
      <div>
        <label
          htmlFor="text"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Note Content *
        </label>
        <Textarea
          id="text"
          {...register('text')}
          placeholder="Enter your note here or record audio above..."
          rows={4}
          error={errors.text?.message}
        />
        {transcription && !textValue && (
          <p className="text-xs text-gray-500 mt-1">
            Transcription will be used as note text
          </p>
        )}
      </div>

      {/* Hidden Fields */}
      <input type="hidden" {...register('lead_id')} />
      <input type="hidden" {...register('staff_id')} />
      <input type="hidden" {...register('audio_url')} />
      <input type="hidden" {...register('transcription_text')} />
      <input type="hidden" {...register('confidence_score', { valueAsNumber: true })} />

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Saving...
            </>
          ) : (
            'Save Note'
          )}
        </Button>
      </div>
    </form>
  );
}

export default NoteForm;
