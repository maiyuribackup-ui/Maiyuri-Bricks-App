'use client';

import { useState, useEffect } from 'react';
import { Button, Spinner } from '@maiyuri/ui';

interface TranscriptionStatusProps {
  audioUrl: string;
  noteId?: string;
  mimeType?: string;
  onTranscriptionComplete: (result: {
    text: string;
    confidence: number;
    language: string;
  }) => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
}

type TranscriptionState = 'idle' | 'transcribing' | 'completed' | 'error';

export function TranscriptionStatus({
  audioUrl,
  noteId,
  mimeType = 'audio/webm',
  onTranscriptionComplete,
  onError,
  autoStart = false,
}: TranscriptionStatusProps) {
  const [state, setState] = useState<TranscriptionState>('idle');
  const [result, setResult] = useState<{
    text: string;
    confidence: number;
    language: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startTranscription = async () => {
    setState('transcribing');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioUrl,
          noteId,
          mimeType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Transcription failed');
      }

      const { data } = await response.json();
      setResult(data);
      setState('completed');
      onTranscriptionComplete(data);
    } catch (err) {
      console.error('Transcription error:', err);
      const message = err instanceof Error ? err.message : 'Transcription failed';
      setErrorMessage(message);
      setState('error');
      onError?.(message);
    }
  };

  // Auto-start transcription if enabled
  useEffect(() => {
    if (autoStart && state === 'idle') {
      startTranscription();
    }
  }, [autoStart, audioUrl]);

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return { label: 'High', color: 'text-green-600' };
    if (confidence >= 0.7) return { label: 'Medium', color: 'text-yellow-600' };
    return { label: 'Low', color: 'text-red-600' };
  };

  const getLanguageLabel = (lang: string) => {
    switch (lang) {
      case 'ta':
        return 'Tamil';
      case 'en':
        return 'English';
      case 'mixed':
        return 'Tamil + English';
      default:
        return lang;
    }
  };

  return (
    <div className="space-y-3">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Transcription</h4>
        {state === 'idle' && (
          <Button variant="secondary" size="sm" onClick={startTranscription}>
            <TranscribeIcon className="mr-1 h-3 w-3" />
            Transcribe
          </Button>
        )}
      </div>

      {/* Transcribing State */}
      {state === 'transcribing' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
          <Spinner size="sm" />
          <div>
            <p className="text-sm font-medium text-blue-700">
              Transcribing audio...
            </p>
            <p className="text-xs text-blue-600">
              Using Gemini AI for accurate transcription
            </p>
          </div>
        </div>
      )}

      {/* Completed State */}
      {state === 'completed' && result && (
        <div className="space-y-2">
          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <ConfidenceIcon className="h-3 w-3" />
              Confidence:{' '}
              <span className={getConfidenceLabel(result.confidence).color}>
                {getConfidenceLabel(result.confidence).label} (
                {Math.round(result.confidence * 100)}%)
              </span>
            </span>
            <span className="flex items-center gap-1">
              <LanguageIcon className="h-3 w-3" />
              Language: {getLanguageLabel(result.language)}
            </span>
          </div>

          {/* Transcription Text */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {result.text}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(result.text)}
            >
              <CopyIcon className="mr-1 h-3 w-3" />
              Copy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={startTranscription}
            >
              <RefreshIcon className="mr-1 h-3 w-3" />
              Re-transcribe
            </Button>
          </div>
        </div>
      )}

      {/* Error State */}
      {state === 'error' && (
        <div className="p-4 bg-red-50 rounded-lg">
          <p className="text-sm text-red-700">{errorMessage}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={startTranscription}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

// Icon components
function TranscribeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </svg>
  );
}

function ConfidenceIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function LanguageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

export default TranscriptionStatus;
