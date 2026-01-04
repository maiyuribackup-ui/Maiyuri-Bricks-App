'use client';

import { useState, useRef, useCallback } from 'react';
import { Button, Spinner } from '@maiyuri/ui';

interface AudioUploaderProps {
  leadId?: string;
  onUploadComplete: (audioData: {
    path: string;
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'uploading';

export function AudioUploader({
  leadId,
  onUploadComplete,
  onError,
  disabled = false,
}: AudioUploaderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setState('recording');
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      onError?.('Failed to access microphone. Please check permissions.');
    }
  }, [onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
      setState('idle');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [state]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      const allowedTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/webm',
        'audio/ogg',
        'audio/m4a',
        'audio/x-m4a',
      ];
      if (!allowedTypes.includes(file.type)) {
        onError?.('Invalid file type. Please upload an audio file.');
        return;
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        onError?.('File size exceeds 10MB limit.');
        return;
      }

      setAudioBlob(file);
      setAudioUrl(URL.createObjectURL(file));
    },
    [onError]
  );

  const uploadAudio = useCallback(async () => {
    if (!audioBlob) return;

    setState('uploading');
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      if (leadId) {
        formData.append('leadId', leadId);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { data } = await response.json();
      onUploadComplete(data);

      // Reset state
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    } catch (err) {
      console.error('Upload error:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to upload audio');
    } finally {
      setState('idle');
    }
  }, [audioBlob, leadId, onUploadComplete, onError]);

  const clearRecording = useCallback(() => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Recording Controls */}
      {!audioUrl && (
        <div className="flex items-center gap-4">
          {state === 'recording' ? (
            <>
              <Button variant="danger" onClick={stopRecording}>
                <span className="mr-2 h-2 w-2 rounded-full bg-white animate-pulse" />
                Stop Recording ({formatTime(recordingTime)})
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={startRecording}
                disabled={disabled || state === 'uploading'}
              >
                <MicIcon className="mr-2 h-4 w-4" />
                Record Audio
              </Button>
              <span className="text-sm text-gray-500">or</span>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || state === 'uploading'}
              >
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}
        </div>
      )}

      {/* Audio Preview */}
      {audioUrl && (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <audio src={audioUrl} controls className="flex-1" />
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={uploadAudio}
              disabled={state === 'uploading'}
            >
              {state === 'uploading' ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                'Upload'
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={clearRecording}
              disabled={state === 'uploading'}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Helper Text */}
      <p className="text-xs text-gray-500">
        Supported formats: MP3, WAV, WebM, OGG, M4A. Max size: 10MB
      </p>
    </div>
  );
}

// Icon components
function MicIcon({ className }: { className?: string }) {
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
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

export default AudioUploader;
