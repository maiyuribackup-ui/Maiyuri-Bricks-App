'use client';

import { useState, useRef } from 'react';
import { Button, Spinner } from '@maiyuri/ui';

interface AudioUploadProps {
  leadId: string;
  onTranscriptionComplete: (transcription: {
    text: string;
    confidence: number;
    language?: string;
  }) => void;
  onError?: (error: string) => void;
}

type UploadState = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'success' | 'error';

export function AudioUpload({ leadId, onTranscriptionComplete, onError }: AudioUploadProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptionText, setTranscriptionText] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleError = (message: string) => {
    setErrorMessage(message);
    setState('error');
    onError?.(message);
  };

  const resetState = () => {
    setState('idle');
    setErrorMessage('');
    setRecordingTime(0);
    setTranscriptionText('');
  };

  // Handle file upload
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/x-m4a'];
    if (!allowedTypes.includes(file.type)) {
      handleError('Invalid file type. Please upload MP3, WAV, WebM, OGG, or M4A files.');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      handleError('File size exceeds 10MB limit.');
      return;
    }

    await uploadAndTranscribe(file);
  };

  // Upload file and transcribe
  const uploadAndTranscribe = async (file: Blob) => {
    try {
      setState('uploading');

      // Upload to Supabase Storage
      const formData = new FormData();
      formData.append('file', file, `recording-${Date.now()}.webm`);
      formData.append('leadId', leadId);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const error = await uploadRes.json();
        throw new Error(error.error || 'Failed to upload audio');
      }

      const uploadData = await uploadRes.json();

      // Transcribe the audio
      setState('transcribing');

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: uploadData.data.url,
          mimeType: file.type || 'audio/webm',
          language: 'auto',
        }),
      });

      if (!transcribeRes.ok) {
        const error = await transcribeRes.json();
        throw new Error(error.error || 'Failed to transcribe audio');
      }

      const transcribeData = await transcribeRes.json();

      setState('success');
      setTranscriptionText(transcribeData.data.text);

      onTranscriptionComplete({
        text: transcribeData.data.text,
        confidence: transcribeData.data.confidence || 0.8,
        language: transcribeData.data.language,
      });

    } catch (err) {
      handleError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await uploadAndTranscribe(audioBlob);
      };

      mediaRecorder.start(1000); // Collect data every second
      setState('recording');

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        handleError('Microphone access denied. Please allow microphone access and try again.');
      } else {
        handleError('Failed to start recording. Please check your microphone.');
      }
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Recording/Upload Controls */}
      {state === 'idle' && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={startRecording}
            className="flex items-center gap-2"
          >
            <MicrophoneIcon className="h-4 w-4" />
            Record Audio
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2"
          >
            <UploadIcon className="h-4 w-4" />
            Upload Audio
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Recording State */}
      {state === 'recording' && (
        <div className="flex items-center gap-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-red-600 dark:text-red-400 font-medium">
              Recording... {formatTime(recordingTime)}
            </span>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={stopRecording}
          >
            Stop Recording
          </Button>
        </div>
      )}

      {/* Processing States */}
      {(state === 'uploading' || state === 'transcribing') && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Spinner size="sm" />
          <span className="text-blue-600 dark:text-blue-400">
            {state === 'uploading' ? 'Uploading audio...' : 'Transcribing audio with AI...'}
          </span>
        </div>
      )}

      {/* Success State */}
      {state === 'success' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckIcon className="h-5 w-5" />
            <span className="font-medium">Transcription complete!</span>
          </div>
          {transcriptionText && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
              <p className="text-slate-700 dark:text-slate-300">{transcriptionText}</p>
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={resetState}
          >
            Record/Upload Another
          </Button>
        </div>
      )}

      {/* Error State */}
      {state === 'error' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <ExclamationIcon className="h-5 w-5" />
            <span>{errorMessage}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={resetState}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Help Text */}
      {state === 'idle' && (
        <p className="text-xs text-slate-500">
          Record a voice note or upload an audio file (MP3, WAV, M4A, WebM).
          Audio will be automatically transcribed.
        </p>
      )}
    </div>
  );
}

// Icons
function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}
