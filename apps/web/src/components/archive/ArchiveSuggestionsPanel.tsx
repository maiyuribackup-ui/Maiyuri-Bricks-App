'use client';

import { useState, useMemo } from 'react';
import { Card, Button, Badge, Spinner, EmptyState } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import type { ArchiveSuggestion } from '@maiyuri/shared';
import {
  useArchiveSuggestions,
  useProcessSuggestions,
  useRefreshSuggestions,
} from '@/hooks/useArchive';

interface ArchiveSuggestionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ArchiveSuggestionsPanel({ isOpen, onClose }: ArchiveSuggestionsPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useArchiveSuggestions();
  const processMutation = useProcessSuggestions();
  const refreshMutation = useRefreshSuggestions();

  const suggestions = data?.suggestions ?? [];

  // Group suggestions by criteria type
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, ArchiveSuggestion[]> = {
      converted: [],
      lost: [],
      cold: [],
    };

    suggestions.forEach((s) => {
      const reason = s.suggestion_reason.toLowerCase();
      if (reason.includes('converted')) {
        groups.converted.push(s);
      } else if (reason.includes('lost')) {
        groups.lost.push(s);
      } else if (reason.includes('cold') || reason.includes('inactive')) {
        groups.cold.push(s);
      }
    });

    return groups;
  }, [suggestions]);

  const handleSelectAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  };

  const handleToggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0) return;
    await processMutation.mutateAsync({
      suggestion_ids: Array.from(selectedIds),
      action: 'accept',
    });
    setSelectedIds(new Set());
  };

  const handleDismissSelected = async () => {
    if (selectedIds.size === 0) return;
    await processMutation.mutateAsync({
      suggestion_ids: Array.from(selectedIds),
      action: 'dismiss',
    });
    setSelectedIds(new Set());
  };

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  if (!isOpen) return null;

  const isProcessing = processMutation.isPending;
  const isRefreshing = refreshMutation.isPending;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ArchiveIcon className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Smart Archive
            </h2>
            {suggestions.length > 0 && (
              <Badge variant="warning">{suggestions.length}</Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-500">Failed to load suggestions</p>
              <Button size="sm" variant="ghost" onClick={handleRefresh} className="mt-2">
                Try Again
              </Button>
            </div>
          ) : suggestions.length === 0 ? (
            <EmptyState
              title="No Archive Suggestions"
              description="All your leads are active and up-to-date."
              icon={<CheckCircleIcon className="h-12 w-12" />}
              action={
                <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={isRefreshing}>
                  {isRefreshing ? 'Refreshing...' : 'Check Again'}
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                  label="Converted"
                  count={groupedSuggestions.converted.length}
                  color="green"
                />
                <SummaryCard
                  label="Lost"
                  count={groupedSuggestions.lost.length}
                  color="red"
                />
                <SummaryCard
                  label="Cold"
                  count={groupedSuggestions.cold.length}
                  color="blue"
                />
              </div>

              {/* Refresh Button */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshIcon className={cn('mr-1 h-4 w-4', isRefreshing && 'animate-spin')} />
                  Refresh
                </Button>
              </div>

              {/* Select All */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === suggestions.length && suggestions.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-slate-600 dark:text-slate-400">
                    Select All ({suggestions.length})
                  </span>
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-sm text-slate-500">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>

              {/* Suggestions List */}
              <div className="space-y-3">
                {suggestions.map((suggestion) => (
                  <SuggestionItem
                    key={suggestion.id}
                    suggestion={suggestion}
                    isSelected={selectedIds.has(suggestion.id)}
                    onToggle={() => handleToggleSelection(suggestion.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {suggestions.length > 0 && (
          <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="primary"
                onClick={handleArchiveSelected}
                disabled={selectedIds.size === 0 || isProcessing}
              >
                {isProcessing ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <ArchiveIcon className="mr-2 h-4 w-4" />
                )}
                Archive ({selectedIds.size})
              </Button>
              <Button
                variant="ghost"
                onClick={handleDismissSelected}
                disabled={selectedIds.size === 0 || isProcessing}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'green' | 'red' | 'blue';
}) {
  const colorClasses = {
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  };

  return (
    <div className={cn('rounded-lg p-3 text-center', colorClasses[color])}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

// Suggestion Item Component
function SuggestionItem({
  suggestion,
  isSelected,
  onToggle,
}: {
  suggestion: ArchiveSuggestion;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const lead = suggestion.lead;
  const daysSince = getDaysSince(suggestion.suggested_at);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        isSelected
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900 dark:text-white truncate">
            {lead?.name || 'Unknown Lead'}
          </p>
          {suggestion.ai_confidence !== null && (
            <Badge variant={suggestion.ai_confidence >= 0.8 ? 'success' : 'default'}>
              {Math.round(suggestion.ai_confidence * 100)}%
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {suggestion.suggestion_reason}
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Suggested {daysSince === 0 ? 'today' : `${daysSince} days ago`}
        </p>
      </div>
    </div>
  );
}

// Helper function
function getDaysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Icon Components
function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default ArchiveSuggestionsPanel;
