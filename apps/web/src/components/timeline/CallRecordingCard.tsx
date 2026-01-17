'use client';

import { useState } from 'react';
import { Badge } from '@maiyuri/ui';
import type { CallRecording, CallRecordingInsights } from '@maiyuri/shared';

interface CallRecordingCardProps {
  recording: CallRecording;
}

export function CallRecordingCard({ recording }: CallRecordingCardProps) {
  const [showTranscription, setShowTranscription] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatLanguage = (lang: string | null) => {
    if (!lang) return null;
    const languageNames: Record<string, string> = {
      'en': 'English',
      'ta': 'Tamil',
      'hi': 'Hindi',
      'ta-en': 'Tamil-English',
      'en-ta': 'Tamil-English',
    };
    return languageNames[lang.toLowerCase()] || lang;
  };

  const getSentimentConfig = (sentiment: CallRecordingInsights['sentiment']) => {
    switch (sentiment) {
      case 'positive':
        return { label: 'Positive', icon: '😊', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
      case 'negative':
        return { label: 'Negative', icon: '😟', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
      case 'neutral':
        return { label: 'Neutral', icon: '😐', className: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300' };
      case 'mixed':
        return { label: 'Mixed', icon: '🤔', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' };
      default:
        return null;
    }
  };

  const sentiment = getSentimentConfig(recording.ai_insights?.sentiment);
  const hasInsights = recording.ai_insights && (
    (recording.ai_insights.positive_signals?.length ?? 0) > 0 ||
    (recording.ai_insights.complaints?.length ?? 0) > 0 ||
    (recording.ai_insights.negotiation_signals?.length ?? 0) > 0 ||
    (recording.ai_insights.recommended_actions?.length ?? 0) > 0
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-100 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <PhoneIcon className="h-4 w-4 text-emerald-600" />
          <span className="font-medium text-slate-900 dark:text-white">
            {recording.phone_number}
          </span>
          <Badge variant="default">
            <ClockIcon className="h-3 w-3 mr-1" />
            {formatDuration(recording.duration_seconds)}
          </Badge>
          {formatLanguage(recording.transcription_language) && (
            <Badge variant="default">
              <GlobeIcon className="h-3 w-3 mr-1" />
              {formatLanguage(recording.transcription_language)}
            </Badge>
          )}
        </div>
        {sentiment && (
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${sentiment.className}`}>
            <span>{sentiment.icon}</span>
            {sentiment.label}
          </span>
        )}
      </div>

      {/* Audio Player Link */}
      {recording.mp3_gdrive_url && (
        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
          <a
            href={recording.mp3_gdrive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <HeadphonesIcon className="h-4 w-4" />
            Listen on Google Drive
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* AI Summary (always visible if available) */}
      {recording.ai_summary && (
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <SparklesIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
              AI Summary
            </span>
          </div>
          <p className="text-sm text-purple-900 dark:text-purple-100">
            {recording.ai_summary}
          </p>
        </div>
      )}

      {/* Expandable: Transcription */}
      {recording.transcription_text && (
        <div className="border-b border-slate-100 dark:border-slate-700">
          <button
            onClick={() => setShowTranscription(!showTranscription)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <DocumentTextIcon className="h-4 w-4" />
              Show Transcription
            </span>
            <ChevronIcon className={`h-4 w-4 transition-transform ${showTranscription ? 'rotate-180' : ''}`} />
          </button>
          {showTranscription && (
            <div className="px-3 pb-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    Transcription
                  </span>
                  {recording.transcription_confidence && (
                    <Badge
                      variant={
                        recording.transcription_confidence >= 0.9 ? 'success' :
                        recording.transcription_confidence >= 0.7 ? 'warning' : 'danger'
                      }
                    >
                      {Math.round(recording.transcription_confidence * 100)}% confidence
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap">
                  {recording.transcription_text}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable: AI Insights */}
      {hasInsights && (
        <div>
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LightBulbIcon className="h-4 w-4" />
              Show AI Insights
            </span>
            <ChevronIcon className={`h-4 w-4 transition-transform ${showInsights ? 'rotate-180' : ''}`} />
          </button>
          {showInsights && (
            <div className="px-3 pb-3 space-y-3">
              {/* Positive Signals */}
              {(recording.ai_insights?.positive_signals?.length ?? 0) > 0 && (
                <InsightSection
                  title="Positive Signals"
                  items={recording.ai_insights!.positive_signals!}
                  variant="success"
                  icon="✅"
                />
              )}

              {/* Complaints */}
              {(recording.ai_insights?.complaints?.length ?? 0) > 0 && (
                <InsightSection
                  title="Complaints"
                  items={recording.ai_insights!.complaints!}
                  variant="danger"
                  icon="⚠️"
                />
              )}

              {/* Negative Feedback */}
              {(recording.ai_insights?.negative_feedback?.length ?? 0) > 0 && (
                <InsightSection
                  title="Concerns"
                  items={recording.ai_insights!.negative_feedback!}
                  variant="danger"
                  icon="😕"
                />
              )}

              {/* Negotiation Signals */}
              {(recording.ai_insights?.negotiation_signals?.length ?? 0) > 0 && (
                <InsightSection
                  title="Negotiation Signals"
                  items={recording.ai_insights!.negotiation_signals!}
                  variant="warning"
                  icon="💰"
                />
              )}

              {/* Price Expectations */}
              {(recording.ai_insights?.price_expectations?.length ?? 0) > 0 && (
                <InsightSection
                  title="Price Expectations"
                  items={recording.ai_insights!.price_expectations!}
                  variant="info"
                  icon="💵"
                />
              )}

              {/* Recommended Actions */}
              {(recording.ai_insights?.recommended_actions?.length ?? 0) > 0 && (
                <InsightSection
                  title="Recommended Actions"
                  items={recording.ai_insights!.recommended_actions!}
                  variant="info"
                  icon="🎯"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Insight Section Component
interface InsightSectionProps {
  title: string;
  items: string[];
  variant: 'success' | 'danger' | 'warning' | 'info';
  icon: string;
}

function InsightSection({ title, items, variant, icon }: InsightSectionProps) {
  const variantStyles = {
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };

  const titleStyles = {
    success: 'text-green-700 dark:text-green-300',
    danger: 'text-red-700 dark:text-red-300',
    warning: 'text-amber-700 dark:text-amber-300',
    info: 'text-blue-700 dark:text-blue-300',
  };

  const textStyles = {
    success: 'text-green-900 dark:text-green-100',
    danger: 'text-red-900 dark:text-red-100',
    warning: 'text-amber-900 dark:text-amber-100',
    info: 'text-blue-900 dark:text-blue-100',
  };

  return (
    <div className={`p-3 rounded-lg border ${variantStyles[variant]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span>{icon}</span>
        <span className={`text-xs font-medium ${titleStyles[variant]}`}>
          {title}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className={`text-sm ${textStyles[variant]}`}>
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Icons
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function HeadphonesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function DocumentTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function LightBulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export default CallRecordingCard;
