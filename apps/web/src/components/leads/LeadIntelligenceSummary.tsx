'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import type { Lead, LeadUrgency, ConversionLever } from '@maiyuri/shared';

interface LeadIntelligenceSummaryProps {
  lead: Lead;
  onRefresh?: () => void;
}

async function analyzeLead(id: string): Promise<{ success: boolean; data?: { lead: Lead } }> {
  const res = await fetch(`/api/leads/${id}/analyze`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to analyze lead');
  return res.json();
}

export function LeadIntelligenceSummary({ lead, onRefresh }: LeadIntelligenceSummaryProps) {
  const queryClient = useQueryClient();

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeLead(lead.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      onRefresh?.();
    },
  });

  const hasIntelligence = lead.ai_score !== null || lead.urgency || lead.dominant_objection || lead.best_conversion_lever;
  const isAnalyzing = analyzeMutation.isPending;

  // If no intelligence data, show generate prompt
  if (!hasIntelligence) {
    return (
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SparklesIcon className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Generate Lead Intelligence
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Analyze calls and notes to understand this lead
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? <Spinner size="sm" /> : 'Analyze'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b shadow-sm">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Score Ring */}
        <div className="flex items-center gap-3">
          <ScoreRing score={lead.ai_score ?? 0} />
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Conversion
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {getScoreLabel(lead.ai_score ?? 0)}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        {/* Urgency Badge */}
        {lead.urgency && (
          <div className="flex flex-col">
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">Urgency</span>
            <UrgencyBadge urgency={lead.urgency} />
          </div>
        )}

        {/* Dominant Objection */}
        {lead.dominant_objection && (
          <div className="flex flex-col max-w-[150px]">
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">Objection</span>
            <ObjectionPill objection={lead.dominant_objection} />
          </div>
        )}

        {/* Best Conversion Lever */}
        {lead.best_conversion_lever && (
          <div className="flex flex-col">
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">Best Approach</span>
            <LeverIndicator lever={lead.best_conversion_lever} />
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Refresh Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => analyzeMutation.mutate()}
          disabled={isAnalyzing}
          className="shrink-0"
        >
          {isAnalyzing ? (
            <Spinner size="sm" />
          ) : (
            <RefreshIcon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Next Action Recommendation */}
      {lead.next_action && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <LightbulbIcon className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">Next:</span> {lead.next_action}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

// Score Ring Component
function ScoreRing({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const circumference = 2 * Math.PI * 16;
  const strokeDashoffset = circumference - (score * circumference);

  const getColor = (s: number) => {
    if (s >= 0.7) return { ring: 'text-green-500', bg: 'text-green-100 dark:text-green-900' };
    if (s >= 0.4) return { ring: 'text-amber-500', bg: 'text-amber-100 dark:text-amber-900' };
    return { ring: 'text-red-500', bg: 'text-red-100 dark:text-red-900' };
  };

  const colors = getColor(score);

  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          className="stroke-slate-100 dark:stroke-slate-800"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          className={cn('stroke-current transition-all duration-500', colors.ring)}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-xs font-bold', colors.ring)}>
          {percentage}%
        </span>
      </div>
    </div>
  );
}

// Urgency Badge Component
function UrgencyBadge({ urgency }: { urgency: LeadUrgency }) {
  const config = {
    immediate: { label: 'Immediate', variant: 'danger' as const, icon: '!' },
    '1-3_months': { label: '1-3 months', variant: 'warning' as const, icon: null },
    '3-6_months': { label: '3-6 months', variant: 'default' as const, icon: null },
    unknown: { label: 'Unknown', variant: 'default' as const, icon: '?' },
  };

  const { label, variant, icon } = config[urgency] || config.unknown;

  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {icon && <span className="mr-1 font-bold">{icon}</span>}
      {label}
    </Badge>
  );
}

// Objection Pill Component
function ObjectionPill({ objection }: { objection: string }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-950/30 rounded-full border border-red-200 dark:border-red-800">
      <WarningIcon className="h-3 w-3 text-red-500 shrink-0" />
      <span className="text-xs text-red-700 dark:text-red-300 truncate">
        {objection}
      </span>
    </div>
  );
}

// Conversion Lever Indicator Component
function LeverIndicator({ lever }: { lever: ConversionLever }) {
  const config = {
    proof: { label: 'Show Proof', icon: <CheckBadgeIcon className="h-4 w-4" />, color: 'text-blue-600 dark:text-blue-400' },
    price: { label: 'Negotiate Price', icon: <CurrencyIcon className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400' },
    visit: { label: 'Site Visit', icon: <BuildingIcon className="h-4 w-4" />, color: 'text-purple-600 dark:text-purple-400' },
    relationship: { label: 'Build Trust', icon: <HeartIcon className="h-4 w-4" />, color: 'text-pink-600 dark:text-pink-400' },
    timeline: { label: 'Fast Delivery', icon: <ClockIcon className="h-4 w-4" />, color: 'text-amber-600 dark:text-amber-400' },
  };

  const { label, icon, color } = config[lever] || config.proof;

  return (
    <div className={cn('flex items-center gap-1.5', color)}>
      {icon}
      <span className="text-xs font-medium whitespace-nowrap">{label}</span>
    </div>
  );
}

function getScoreLabel(score: number): string {
  if (score >= 0.8) return 'Very High';
  if (score >= 0.6) return 'High';
  if (score >= 0.4) return 'Medium';
  if (score >= 0.2) return 'Low';
  return 'Very Low';
}

// Icon Components
function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function CheckBadgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 100-6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
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

export default LeadIntelligenceSummary;
