'use client';

import { useState } from 'react';
import { Card, Badge, Button, Avatar } from '@maiyuri/ui';
import { TranscriptionStatus } from './TranscriptionStatus';
import type { Note } from '@maiyuri/shared';

interface NoteCardProps {
  note: Note & {
    staff?: { name: string; email?: string };
    leads?: { name: string; status: string };
  };
  onEdit?: (note: Note) => void;
  onDelete?: (noteId: string) => void;
  showLeadInfo?: boolean;
}

export function NoteCard({
  note,
  onEdit,
  onDelete,
  showLeadInfo = false,
}: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (date: string | Date) => {
    return new Date(date).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getConfidenceBadge = (score: number | null) => {
    if (!score) return null;
    const percentage = Math.round(score * 100);
    if (percentage >= 90) {
      return <Badge variant="success">High Confidence ({percentage}%)</Badge>;
    }
    if (percentage >= 70) {
      return <Badge variant="warning">Medium Confidence ({percentage}%)</Badge>;
    }
    return <Badge variant="danger">Low Confidence ({percentage}%)</Badge>;
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Avatar
            fallback={note.staff?.name?.charAt(0) || 'U'}
            size="sm"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {note.staff?.name || 'Unknown Staff'}
            </p>
            <p className="text-xs text-gray-500">
              {formatDate(note.date)} at {formatTime(note.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {note.audio_url && (
            <Badge variant="default">
              <AudioIcon className="mr-1 h-3 w-3" />
              Audio
            </Badge>
          )}
          {note.confidence_score && getConfidenceBadge(note.confidence_score)}
        </div>
      </div>

      {/* Lead Info (optional) */}
      {showLeadInfo && note.leads && (
        <div className="mb-3 p-2 bg-gray-50 rounded-md">
          <p className="text-xs text-gray-500">Lead</p>
          <p className="text-sm font-medium">{note.leads.name}</p>
        </div>
      )}

      {/* Note Content */}
      <div className="mb-3">
        <p
          className={`text-sm text-gray-700 ${
            isExpanded ? '' : 'line-clamp-3'
          }`}
        >
          {note.text}
        </p>
        {note.text.length > 200 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 hover:text-blue-700 mt-1"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Audio Player & Transcription */}
      {note.audio_url && (
        <div className="space-y-3 mb-3">
          <audio
            src={note.audio_url}
            controls
            className="w-full h-10 rounded"
          />

          {/* Transcription Section */}
          {note.transcription_text ? (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-blue-700">
                  Transcription
                </span>
                {note.confidence_score && (
                  <span className="text-xs text-blue-600">
                    {Math.round(note.confidence_score * 100)}% confidence
                  </span>
                )}
              </div>
              <p className="text-sm text-blue-900">{note.transcription_text}</p>
            </div>
          ) : (
            <>
              {showTranscription ? (
                <TranscriptionStatus
                  audioUrl={note.audio_url}
                  noteId={note.id}
                  autoStart
                  onTranscriptionComplete={(result) => {
                    // Note will be updated via the API
                    setShowTranscription(false);
                  }}
                  onError={(error) => {
                    console.error('Transcription error:', error);
                  }}
                />
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowTranscription(true)}
                >
                  <TranscribeIcon className="mr-1 h-3 w-3" />
                  Transcribe Audio
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* AI Summary */}
      {note.ai_summary && (
        <div className="p-3 bg-purple-50 rounded-lg mb-3">
          <div className="flex items-center gap-2 mb-1">
            <AIIcon className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">
              AI Summary
            </span>
          </div>
          <p className="text-sm text-purple-900">{note.ai_summary}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={() => onEdit(note)}>
            <EditIcon className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(note.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <DeleteIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}

// Icon components
function AudioIcon({ className }: { className?: string }) {
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
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 7h10" />
      <path d="M7 12h10" />
      <path d="M7 17h10" />
    </svg>
  );
}

function AIIcon({ className }: { className?: string }) {
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
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
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
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function DeleteIcon({ className }: { className?: string }) {
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
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

export default NoteCard;
